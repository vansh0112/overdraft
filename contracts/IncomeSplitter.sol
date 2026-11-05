// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Hedera exposes HTS tokens (like USDC 0.0.429274) through an ERC-20 facade at the token's address.
interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @dev Hedera Token Service system contract (HIP-206).
interface IHederaTokenService {
    function associateToken(address account, address token) external returns (int64 responseCode);
}

/// @title IncomeSplitter
/// @notice Receives an agent's x402 income in USDC and splits it when anyone calls sweep():
///         a lender share while a loan is outstanding, a compute share, and the rest to the owner.
/// @dev Receiving tokens on Hedera runs no contract code, so splitting only happens on sweep().
///      Contracts deployed through the JSON-RPC relay can't use auto-association, so call
///      associateUsdc() once after deployment, before the contract is used as an x402 payTo.
contract IncomeSplitter {
    address private constant HTS = address(0x167);
    int64 private constant HTS_SUCCESS = 22;
    int64 private constant HTS_TOKEN_ALREADY_ASSOCIATED = 194;

    uint16 public constant BPS = 10_000;

    IERC20 public immutable usdc;
    address public immutable owner;
    address public immutable admin;
    address public pool;
    address public computeBucket;
    address public creditLine;

    uint16 public lenderBps = 3_000;
    uint16 public computeBps = 2_000;
    /// @notice USDC (6 decimals) still owed to the pool.
    uint256 public owed;

    event Swept(uint256 total, uint256 toPool, uint256 toCompute, uint256 toOwner, uint256 owedAfter);
    event OwedSet(uint256 owed);
    event UsdcAssociated(int64 responseCode);

    error NotAdmin();
    error NotAuthorised();
    error NothingToSweep();
    error TransferFailed();
    error BadShares();
    error AssociateFailed(int64 responseCode);

    constructor(address usdc_, address owner_, address admin_, address pool_, address computeBucket_) {
        usdc = IERC20(usdc_);
        owner = owner_;
        admin = admin_;
        pool = pool_;
        computeBucket = computeBucket_;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /// @notice Lets this contract hold USDC. Safe to call more than once.
    function associateUsdc() external {
        int64 rc = IHederaTokenService(HTS).associateToken(address(this), address(usdc));
        if (rc != HTS_SUCCESS && rc != HTS_TOKEN_ALREADY_ASSOCIATED) revert AssociateFailed(rc);
        emit UsdcAssociated(rc);
    }

    function setCreditLine(address creditLine_) external onlyAdmin {
        creditLine = creditLine_;
    }

    function setShares(uint16 lenderBps_, uint16 computeBps_) external onlyAdmin {
        if (uint256(lenderBps_) + computeBps_ > BPS) revert BadShares();
        lenderBps = lenderBps_;
        computeBps = computeBps_;
    }

    function setOwed(uint256 owed_) external {
        if (msg.sender != creditLine && msg.sender != admin) revert NotAuthorised();
        owed = owed_;
        emit OwedSet(owed_);
    }

    function sweep() external returns (uint256 toPool, uint256 toCompute, uint256 toOwner) {
        uint256 total = usdc.balanceOf(address(this));
        if (total == 0) revert NothingToSweep();

        if (owed > 0) {
            toPool = (total * lenderBps) / BPS;
            if (toPool > owed) toPool = owed;
            owed -= toPool;
        }
        toCompute = (total * computeBps) / BPS;
        toOwner = total - toPool - toCompute;

        _send(pool, toPool);
        _send(computeBucket, toCompute);
        _send(owner, toOwner);
        emit Swept(total, toPool, toCompute, toOwner, owed);
    }

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }
}
