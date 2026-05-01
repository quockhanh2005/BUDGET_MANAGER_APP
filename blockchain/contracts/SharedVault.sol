// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title FundVault
 * @dev Phien ban nang cap tu SharedVault.sol de tuong thich kien truc Hybrid Web2.5.
 *      Su dung EIP-712 de xac thuc chu ky off-chain, toi uu Gas toi da.
 *      Ho tro co che Xoa Quy (Deactivate) va Quan ly Thanh vien (Add/Remove Admin).
 */
contract SharedVault is Initializable, EIP712Upgradeable, ReentrancyGuard {
    using ECDSA for bytes32;

    address[] public admins;
    mapping(address => bool) public isAdmin;
    uint256 public threshold;
    uint256 public activeAdminCount;
    bool public isActive;
    
    // Chong tan cong phat lai (Replay Attack)
    mapping(uint256 => bool) public executedNonces;
    
    // Cau truc Hash theo chuan EIP-712 de nguoi dung ky xac nhan
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(
        "WithdrawRequest(address to,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CLOSE_FUND_TYPEHASH = keccak256(
        "CloseFundRequest(uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant ADD_ADMIN_TYPEHASH = keccak256(
        "AddAdminRequest(address newAdmin,uint256 newThreshold,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant REMOVE_ADMIN_TYPEHASH = keccak256(
        "RemoveAdminRequest(address oldAdmin,uint256 newThreshold,uint256 nonce,uint256 deadline)"
    );

    event VaultInitialized(address[] admins, uint256 threshold);
    event Deposit(address indexed sender, address indexed onBehalfOf, uint256 amount);
    event WithdrawExecuted(uint256 indexed nonce, address indexed to, uint256 amount);
    event FundClosed();
    event AdminAdded(address indexed newAdmin, uint256 newThreshold);
    event AdminRemoved(address indexed oldAdmin, uint256 newThreshold);

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Khong phai Admin");
        _;
    }

    modifier onlyActive() {
        require(isActive, "Quy da bi dong");
        _;
    }

    /**
     * @dev Khoi tao quy (Thay the constructor cho mo hinh Proxy)
     */
    function initialize(
        address[] memory _admins,
        uint256 _threshold 
    ) external initializer {
        __EIP712_init("FundVault", "1");

        require(_admins.length > 0, "Danh sach Admin trong");
        require(_threshold > 0 && _threshold <= _admins.length, "Nguong phe duyet khong hop le");
        
        for (uint256 i = 0; i < _admins.length; i++) {
            address admin = _admins[i];
            require(admin != address(0), "Dia chi Admin khong hop le");
            require(!isAdmin[admin], "Admin bi trung lap");
            isAdmin[admin] = true;
            admins.push(admin);
        }
        
        threshold = _threshold;
        activeAdminCount = _admins.length;
        isActive = true;
        
        emit VaultInitialized(_admins, _threshold);
    }

    /**
     * @dev Cap nhat co che nhan Ether truc tiep tu MetaMask
     */
    receive() external payable onlyActive {
        emit Deposit(msg.sender, msg.sender, msg.value);
    }

    /**
     * @dev Ham nap tien ho tu Vi Tong (Treasury) cua he thong
     */
    function depositFor(address _onBehalfOf) external payable {
        require(msg.value > 0, "So luong nap phai lon hon 0");
        emit Deposit(msg.sender, _onBehalfOf, msg.value);
    }

    /**
     * @dev Ham noi bo xac minh chu ky EIP-712
     */
    function _verifySignatures(
        bytes32 structHash,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) internal {
        require(block.timestamp <= _deadline, "Chu ky da het han");
        require(!executedNonces[_nonce], "Nonce da duoc su dung");
        require(_signatures.length >= threshold, "Khong du so luong chu ky");

        bytes32 hash = _hashTypedDataV4(structHash);

        address lastSigner = address(0);
        for (uint256 i = 0; i < _signatures.length; i++) {
            address signer = hash.recover(_signatures[i]);
            require(isAdmin[signer], "Chu ky khong hop le");
            require(uint160(signer) > uint160(lastSigner), "Chu ky bi trung lap hoac sai thu tu");
            lastSigner = signer;
        }

        executedNonces[_nonce] = true;
    }

    /**
     * @dev Thuc thi rut tien bang cach xac thuc chu ky EIP-712 (Toi uu Gas)
     */
    function executeWithdraw(
        address payable _to,
        uint256 _amount,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(address(this).balance >= _amount, "So du quy khong du");

        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TYPEHASH, _to, _amount, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Giao dich chuyen tien that bai");

        emit WithdrawExecuted(_nonce, _to, _amount);
    }

    /**
     * @dev Dong quy (khong cho nap rut nua) sau khi da rut het tien
     */
    function executeCloseFund(
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(address(this).balance == 0, "Phai rut het tien truoc khi dong quy");

        bytes32 structHash = keccak256(
            abi.encode(CLOSE_FUND_TYPEHASH, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        isActive = false;
        emit FundClosed();
    }

    /**
     * @dev Them mot admin moi va cap nhat nguong
     */
    function executeAddAdmin(
        address _newAdmin,
        uint256 _newThreshold,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(_newAdmin != address(0), "Dia chi khong hop le");
        require(!isAdmin[_newAdmin], "Da la admin");
        
        uint256 newTotalAdmins = activeAdminCount + 1;
        require(_newThreshold > 0 && _newThreshold <= newTotalAdmins, "Nguong moi khong hop le");

        bytes32 structHash = keccak256(
            abi.encode(ADD_ADMIN_TYPEHASH, _newAdmin, _newThreshold, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        isAdmin[_newAdmin] = true;
        admins.push(_newAdmin);
        activeAdminCount = newTotalAdmins;
        threshold = _newThreshold;

        emit AdminAdded(_newAdmin, _newThreshold);
    }

    /**
     * @dev Xoa mot admin va cap nhat nguong
     */
    function executeRemoveAdmin(
        address _oldAdmin,
        uint256 _newThreshold,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant onlyActive {
        require(isAdmin[_oldAdmin], "Khong phai admin hoac da bi xoa");
        
        uint256 newTotalAdmins = activeAdminCount - 1;
        require(_newThreshold > 0 && _newThreshold <= newTotalAdmins, "Nguong moi khong hop le");

        bytes32 structHash = keccak256(
            abi.encode(REMOVE_ADMIN_TYPEHASH, _oldAdmin, _newThreshold, _nonce, _deadline)
        );
        _verifySignatures(structHash, _nonce, _deadline, _signatures);

        isAdmin[_oldAdmin] = false;
        activeAdminCount = newTotalAdmins;
        threshold = _newThreshold;

        emit AdminRemoved(_oldAdmin, _newThreshold);
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}