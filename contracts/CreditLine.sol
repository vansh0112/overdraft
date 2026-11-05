// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIncomeSplitter {
    function owed() external view returns (uint256);
    function setOwed(uint256 owed_) external;
}

/// @title CreditLine
/// @notice Credit lines for AI agents. The underwriter sets each agent's limit; the agent requests
///         loans within it; the debt (principal plus fee) is recorded on the agent's IncomeSplitter,
///         which repays it automatically from income. The relayer deposits each loan into the
///         agent's 0G compute account and records the 0G transaction here.
/// @dev Amounts are USDC atomic units (6 decimals): the USD value of compute lent.
contract CreditLine {
    uint16 public constant BPS = 10_000;

    address public immutable admin;
    address public underwriter;
    address public relayer;
    uint16 public feeBps;

    struct Line {
        address agent;       // the agent's Hedera account that may request loans
        address splitter;    // the agent's IncomeSplitter
        address zgAccount;   // the agent's 0G compute account, where loans are deposited
        uint256 limit;       // maximum debt outstanding, fee included
        bytes32 decisionHash;
    }

    struct Draw {
        uint256 agentId;
        uint256 amount;
        bytes32 zgTxHash;
    }

    mapping(uint256 => Line) public lines;
    Draw[] public draws;

    event RolesSet(address underwriter, address relayer, uint16 feeBps);
    event LimitSet(uint256 indexed agentId, address agent, address splitter, address zgAccount, uint256 limit, bytes32 decisionHash);
    event DrawRequested(uint256 indexed drawId, uint256 indexed agentId, address zgAccount, uint256 amount, uint256 owedAfter);
    event Disbursed(uint256 indexed drawId, uint256 indexed agentId, bytes32 zgTxHash);

    error NotAdmin();
    error NotUnderwriter();
    error NotRelayer();
    error NotAgent();
    error NoLine();
    error ZeroAmount();
    error OverLimit(uint256 requestedWithFee, uint256 available);
    error AlreadyDisbursed();
    error BadFee();

    constructor(address underwriter_, address relayer_, uint16 feeBps_) {
        admin = msg.sender;
        _setRoles(underwriter_, relayer_, feeBps_);
    }

    function setRoles(address underwriter_, address relayer_, uint16 feeBps_) external {
        if (msg.sender != admin) revert NotAdmin();
        _setRoles(underwriter_, relayer_, feeBps_);
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
        lines[agentId] = Line(agent, splitter, zgAccount, limit, decisionHash);
        emit LimitSet(agentId, agent, splitter, zgAccount, limit, decisionHash);
    }

    /// @notice Debt still outstanding for an agent, read from its IncomeSplitter.
    function owedOf(uint256 agentId) public view returns (uint256) {
        Line storage line = lines[agentId];
        if (line.splitter == address(0)) revert NoLine();
        return IIncomeSplitter(line.splitter).owed();
    }

    function availableOf(uint256 agentId) public view returns (uint256) {
        uint256 owed = owedOf(agentId);
        uint256 limit = lines[agentId].limit;
        return owed >= limit ? 0 : limit - owed;
    }

    /// @notice Called by the agent itself. Records the debt and asks the relayer to fund 0G compute.
    function requestDraw(uint256 agentId, uint256 amount) external returns (uint256 drawId) {
        Line storage line = lines[agentId];
        if (line.splitter == address(0)) revert NoLine();
        if (msg.sender != line.agent) revert NotAgent();
        if (amount == 0) revert ZeroAmount();

        uint256 withFee = amount + (amount * feeBps) / BPS;
        uint256 available = availableOf(agentId);
        if (withFee > available) revert OverLimit(withFee, available);

        uint256 owedAfter = IIncomeSplitter(line.splitter).owed() + withFee;
        IIncomeSplitter(line.splitter).setOwed(owedAfter);

        drawId = draws.length;
        draws.push(Draw(agentId, amount, bytes32(0)));
        emit DrawRequested(drawId, agentId, line.zgAccount, amount, owedAfter);
    }

    /// @notice Records the 0G transaction that deposited a loan into the agent's compute account.
    function markDisbursed(uint256 drawId, bytes32 zgTxHash) external {
        if (msg.sender != relayer) revert NotRelayer();
        Draw storage draw = draws[drawId];
        if (draw.zgTxHash != bytes32(0)) revert AlreadyDisbursed();
        draw.zgTxHash = zgTxHash;
        emit Disbursed(drawId, draw.agentId, zgTxHash);
    }

    function drawCount() external view returns (uint256) {
        return draws.length;
    }

    function _setRoles(address underwriter_, address relayer_, uint16 feeBps_) private {
        if (feeBps_ > 2_000) revert BadFee();
        underwriter = underwriter_;
        relayer = relayer_;
        feeBps = feeBps_;
        emit RolesSet(underwriter_, relayer_, feeBps_);
    }
}
