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
 */
contract SharedVault is Initializable, EIP712Upgradeable, ReentrancyGuard {
    using ECDSA for bytes32;

    address[] public admins;
    mapping(address => bool) public isAdmin;
    uint256 public threshold;
    
    // Chong tan cong phat lai (Replay Attack)
    mapping(uint256 => bool) public executedNonces;

    // Cau truc Hash theo chuan EIP-712 de nguoi dung ky xac nhan
    bytes32 public constant WITHDRAW_TYPEHASH = keccak256(
        "WithdrawRequest(address to,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    event VaultInitialized(address[] admins, uint256 threshold);
    event Deposit(address indexed sender, address indexed onBehalfOf, uint256 amount);
    event WithdrawExecuted(uint256 indexed nonce, address indexed to, uint256 amount);

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Khong phai Admin");
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
        emit VaultInitialized(_admins, _threshold);
    }

    /**
     * @dev Cap nhat co che nhan Ether truc tiep tu MetaMask
     */
    receive() external payable {
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
     * @dev Thuc thi rut tien bang cach xac thuc chu ky EIP-712 (Toi uu Gas)
     *      Nguoi goi phai truyen vao mang cac chu ky (signatures) da duoc sap xep
     *      theo thu tu tang dan cua dia chi admin de tranh trung lap.
     */
    function executeWithdraw(
        address payable _to,
        uint256 _amount,
        uint256 _nonce,
        uint256 _deadline,
        bytes[] calldata _signatures
    ) external nonReentrant {
        require(block.timestamp <= _deadline, "Chu ky da het han");
        require(!executedNonces[_nonce], "Nonce da duoc su dung");
        require(_signatures.length >= threshold, "Khong du so luong chu ky");
        require(address(this).balance >= _amount, "So du quy khong du");

        // 1. Tao Hash tu du lieu dau vao
        bytes32 structHash = keccak256(
            abi.encode(WITHDRAW_TYPEHASH, _to, _amount, _nonce, _deadline)
        );
        bytes32 hash = _hashTypedDataV4(structHash);

        // 2. Xac thuc mang chu ky (Hieu qua hon viec approve tung buoc On-chain)
        address lastSigner = address(0);
        for (uint256 i = 0; i < _signatures.length; i++) {
            address signer = hash.recover(_signatures[i]);
            require(isAdmin[signer], "Chu ky khong hop le");
            // Dam bao khong co chu ky trung lap (Sap xep dia chi de kiem tra nhanh)
            require(uint160(signer) > uint160(lastSigner), "Chu ky bi trung lap hoac sai thu tu");
            lastSigner = signer;
        }

        // 3. Chuyen tien va hoan tat
        executedNonces[_nonce] = true;
        (bool success, ) = _to.call{value: _amount}("");
        require(success, "Giao dich chuyen tien that bai");

        emit WithdrawExecuted(_nonce, _to, _amount);
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}