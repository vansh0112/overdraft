// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIncomeSplitter {
    function owed() external view returns (uint256);
    function setOwed(uint256 owed_) external;
}

/// @dev The ERC-8004 IdentityRegistry is an ERC-721: each agent ID is a token owned by the agent's owner.
interface IAgentIdentity {
    function ownerOf(uint256 agentId) external view returns (address);
    function transferFrom(address from, address to, uint256 agentId) external;
}

/// @title CreditLine
/// @notice Credit lines for AI agents, secured by the agent's ERC-8004 identity.
///         The underwriter sets each agent's limit. The agent requests loans within it; the first loan
///         of a debt cycle locks the agent's ID here, using the owner's one-time approval. The debt
///         (principal plus a fixed fee) is recorded on the agent's IncomeSplitter, which repays it from
///         income; once the debt is zero anyone can release the ID back to its owner. If the debt is
///         overdue past the grace period, or the watcher reports a breach, the line defaults and the ID
///         goes to the treasury. The relayer deposits each loan into the agent's 0G compute account and
///         records the 0G transaction here.
/// @dev Amounts are USDC atomic units (6 decimals): the USD value of compute lent.
///      Trust: the underwriter sets limits, the relayer records 0G deposits, and the watcher can report
///      breaches. The fee, term and grace period are fixed at deployment.
contract CreditLine {
    uint16 public constant BPS = 10_000;

    enum Status { None, Active, Defaulted }

    struct Line {
        address agent;       // the agent's Hedera account that may request loans
        address owner;       // the owner of the agent's ID, who gets it back after repayment
        address splitter;    // the agent's IncomeSplitter
        address zgAccount;   // the agent's 0G compute account, where loans are deposited
        uint256 limit;       // maximum debt outstanding, fee included
        bytes32 decisionHash;
        uint64 dueAt;        // when the current debt cycle must be repaid (0 when there is no debt)
        bool idLocked;
        Status status;
    }

    struct Draw {
        uint256 agentId;
        uint256 amount;
        bytes32 zgTxHash;
    }

    address public immutable admin;
    IAgentIdentity public immutable identity;
    address public immutable treasury;
    uint16 public immutable feeBps;
    uint64 public immutable termSeconds;
    uint64 public immutable graceSeconds;

    address public underwriter;
    address public relayer;
    address public watcher;

    mapping(uint256 => Line) public lines;
    mapping(address => uint256) public agentOfSplitter;
    Draw[] public draws;
    uint256 private _entered;

    event RolesSet(address underwriter, address relayer, address watcher);
    event LimitSet(uint256 indexed agentId, address agent, address owner, address splitter, address zgAccount, uint256 limit, bytes32 decisionHash);
    event IdLocked(uint256 indexed agentId, address owner);
    event IdReleased(uint256 indexed agentId, address owner);
    event DrawRequested(uint256 indexed drawId, uint256 indexed agentId, address zgAccount, uint256 amount, uint256 owedAfter, uint64 dueAt);
    event Disbursed(uint256 indexed drawId, uint256 indexed agentId, bytes32 zgTxHash);
    event Breach(uint256 indexed agentId, string reason);
    event Defaulted(uint256 indexed agentId, uint256 owed, address idSentTo);

    error NotAdmin();
    error NotUnderwriter();
    error NotRelayer();
    error NotWatcher();
    error NotAgent();
    error NoLine();
    error LineDefaulted();
    error ZeroAmount();
    error OverLimit(uint256 requestedWithFee, uint256 available);
    error AlreadyDisbursed();
    error StillOwed(uint256 owed);
    error NothingLocked();
    error NotOverdue(uint64 dueAt);
    error NoDebt();
    error BadParams();
    error Reentrant();
    error SplitterLocked();

    /// @dev Functions that call the identity registry run one at a time.
    modifier nonReentrant() {
        if (_entered == 1) revert Reentrant();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(
        address identity_,
        address treasury_,
        uint16 feeBps_,
        uint64 termSeconds_,
        uint64 graceSeconds_,
        address underwriter_,
        address relayer_,
        address watcher_
    ) {
        if (feeBps_ > 2_000 || termSeconds_ == 0 || identity_ == address(0) || treasury_ == address(0)) revert BadParams();
        admin = msg.sender;
        identity = IAgentIdentity(identity_);
        treasury = treasury_;
        feeBps = feeBps_;
        termSeconds = termSeconds_;
        graceSeconds = graceSeconds_;
        _setRoles(underwriter_, relayer_, watcher_);
    }

    /// @notice Rotates operational keys. The fee, term, grace period and treasury can't be changed.
    function setRoles(address underwriter_, address relayer_, address watcher_) external {
        if (msg.sender != admin) revert NotAdmin();
        _setRoles(underwriter_, relayer_, watcher_);
    }

    function setLimit(
        uint256 agentId,
        address agent,
        address splitter,
        address zgAccount,
        uint256 limit,
        bytes32 decisionHash
    ) external {
        if (msg.sender != underwriter) revert NotUnderwriter();
        Line storage line = lines[agentId];
        if (line.status == Status.Defaulted) revert LineDefaulted();
        if (line.idLocked && splitter != line.splitter) revert SplitterLocked(); // debt lives on the current splitter
        address owner = line.idLocked ? line.owner : identity.ownerOf(agentId);
        line.agent = agent;
        line.owner = owner;
        line.splitter = splitter;
        line.zgAccount = zgAccount;
        line.limit = limit;
        line.decisionHash = decisionHash;
        line.status = Status.Active;
        agentOfSplitter[splitter] = agentId;
        emit LimitSet(agentId, agent, owner, splitter, zgAccount, limit, decisionHash);
    }

    function owedOf(uint256 agentId) public view returns (uint256) {
        Line storage line = lines[agentId];
        if (line.splitter == address(0)) revert NoLine();
        return IIncomeSplitter(line.splitter).owed();
    }

    function availableOf(uint256 agentId) public view returns (uint256) {
        if (lines[agentId].status != Status.Active) return 0;
        uint256 owed = owedOf(agentId);
        uint256 limit = lines[agentId].limit;
        return owed >= limit ? 0 : limit - owed;
    }

    /// @notice Called by the agent itself. Locks its ID if needed, records the debt, and asks the
    ///         relayer to fund 0G compute.
    function requestDraw(uint256 agentId, uint256 amount) external nonReentrant returns (uint256 drawId) {
        Line storage line = lines[agentId];
        if (line.status == Status.None) revert NoLine();
        if (line.status == Status.Defaulted) revert LineDefaulted();
        if (msg.sender != line.agent) revert NotAgent();
        if (amount == 0) revert ZeroAmount();

        uint256 withFee = amount + (amount * feeBps) / BPS;
        uint256 owed = IIncomeSplitter(line.splitter).owed();
        uint256 available = owed >= line.limit ? 0 : line.limit - owed;
        if (withFee > available) revert OverLimit(withFee, available);

        if (owed == 0) line.dueAt = uint64(block.timestamp) + termSeconds; // a new debt cycle starts
        if (!line.idLocked) {
            line.idLocked = true;
            identity.transferFrom(line.owner, address(this), agentId); // needs the owner's approval
            emit IdLocked(agentId, line.owner);
        }

        uint256 owedAfter = owed + withFee;
        IIncomeSplitter(line.splitter).setOwed(owedAfter);
        drawId = draws.length;
        draws.push(Draw(agentId, amount, bytes32(0)));
        emit DrawRequested(drawId, agentId, line.zgAccount, amount, owedAfter, line.dueAt);
    }

    /// @notice Records the 0G transaction that deposited a loan into the agent's compute account.
    function markDisbursed(uint256 drawId, bytes32 zgTxHash) external {
        if (msg.sender != relayer) revert NotRelayer();
        Draw storage draw = draws[drawId];
        if (draw.zgTxHash != bytes32(0)) revert AlreadyDisbursed();
        draw.zgTxHash = zgTxHash;
        emit Disbursed(drawId, draw.agentId, zgTxHash);
    }

    /// @notice Returns the agent's ID to its owner once the debt is fully repaid. Anyone may call it.
    function releaseId(uint256 agentId) external nonReentrant {
        Line storage line = lines[agentId];
        if (line.status != Status.Active) revert NoLine();
        if (!line.idLocked) revert NothingLocked();
        uint256 owed = IIncomeSplitter(line.splitter).owed();
        if (owed != 0) revert StillOwed(owed);
        line.idLocked = false;
        line.dueAt = 0;
        identity.transferFrom(address(this), line.owner, agentId);
        emit IdReleased(agentId, line.owner);
    }

    /// @notice The watcher reports a breach (for example, income redirected away from the splitter, or
    ///         compute credit moved out of the agent's account). A line with debt outstanding defaults.
    function flagBreach(uint256 agentId, string calldata reason) external nonReentrant {
        if (msg.sender != watcher) revert NotWatcher();
        Line storage line = lines[agentId];
        if (line.status != Status.Active) revert NoLine();
        emit Breach(agentId, reason);
        uint256 owed = IIncomeSplitter(line.splitter).owed();
        if (owed > 0) _default(agentId, owed);
    }

    /// @notice Anyone may default a line whose debt is still outstanding after the due date plus grace.
    function markOverdue(uint256 agentId) external nonReentrant {
        Line storage line = lines[agentId];
        if (line.status != Status.Active) revert NoLine();
        uint256 owed = IIncomeSplitter(line.splitter).owed();
        if (owed == 0) revert NoDebt();
        if (block.timestamp <= uint256(line.dueAt) + graceSeconds) revert NotOverdue(line.dueAt);
        _default(agentId, owed);
    }

    function drawCount() external view returns (uint256) {
        return draws.length;
    }

    function _default(uint256 agentId, uint256 owed) private {
        Line storage line = lines[agentId];
        line.status = Status.Defaulted;
        if (line.idLocked) {
            line.idLocked = false;
            identity.transferFrom(address(this), treasury, agentId);
        }
        emit Defaulted(agentId, owed, treasury);
    }

    function _setRoles(address underwriter_, address relayer_, address watcher_) private {
        underwriter = underwriter_;
        relayer = relayer_;
        watcher = watcher_;
        emit RolesSet(underwriter_, relayer_, watcher_);
    }
}
