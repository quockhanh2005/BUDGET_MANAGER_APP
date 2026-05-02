// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Giao dien tuong tac voi FundVault (Clone)
interface IFundVaultTemplate {
    function initialize(address owner, address[] memory members, uint256 threshold) external;
}

/**
 * @title FundFactory
 * @dev Nha may san xuat quy nhom su dung EIP-1167. 
 * Kien truc Hybrid: Chi luu trang thai toi thieu On-chain, giao pho viec truy van cho Backend.
 */
contract VaultFactory is Ownable, Pausable, ReentrancyGuard {
    using Clones for address;

    // --- Custom Errors (Toi uu Gas) ---
    error InvalidTemplate();
    error InvalidMember();
    error EmptyMembers();
    error InvalidThreshold();
    error DuplicateMember();
    
    // --- Business Constraints ---
    uint256 public constant MAX_MEMBERS = 20;

    // --- State Variables ---
    address public immutable initialVaultTemplate;
    address public activeVaultTemplate;

    // Chi giu lai Mapping xac thuc de Backend hoac Contract khac kiem tra tinh hop le cua Quy
    mapping(address => bool) public isFundFromFactory;

    // --- Events (Diem ket noi voi Backend Worker) ---
    // Backend se lang nghe event nay de ghi vao MongoDB
    event FundCreated(
        address indexed fundAddress,
        address indexed creator,
        address[] members,
        uint256 threshold,
        uint256 timestamp
    );

    event TemplateUpgraded(
        address indexed oldTemplate,
        address indexed newTemplate,
        uint256 timestamp
    );

    /**
     * @dev Khoi tao Factory
     * @param fundTemplate Dia chi cua Smart Contract FundVault goc da deploy
     */
    constructor(address fundTemplate, address initialOwner) Ownable(initialOwner) {
        if (fundTemplate == address(0) || fundTemplate.code.length == 0) revert InvalidTemplate();

        initialVaultTemplate = fundTemplate;
        activeVaultTemplate = fundTemplate;
    }

    /**
     * @dev Tao quy moi (Su dung Clone EIP-1167)
     * @param members Danh sach vi MetaMask cua cac thanh vien bieu quyet
     * @param threshold So luong chu ky toi thieu de rut tien
     */
    function createFund(address[] calldata members, uint256 threshold)
        external
        whenNotPaused
        nonReentrant
        returns (address newFund)
    {
        uint256 memberCount = members.length;

        // 1. Kiem tra tinh hop le cua du lieu dau vao
        if (memberCount == 0) revert EmptyMembers();
        if (memberCount > MAX_MEMBERS) revert InvalidThreshold();
        if (threshold == 0 || threshold > memberCount) revert InvalidThreshold();

        for (uint256 i = 0; i < memberCount; ) {
            address currentMember = members[i];
            if (currentMember == address(0)) revert InvalidMember();

            // Kiem tra trung lap member (O(n^2) chap nhan duoc vi MAX_MEMBERS nho)
            for (uint256 j = i + 1; j < memberCount; ) {
                if (currentMember == members[j]) revert DuplicateMember();
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }

        if (activeVaultTemplate.code.length == 0) revert InvalidTemplate();

        // 2. Thuc thi nhan ban bang Clones library
        newFund = activeVaultTemplate.clone();
        
        // 3. Khoi tao trang thai cho vi moi (Creator la owner)
        IFundVaultTemplate(newFund).initialize(msg.sender, members, threshold);

        // 4. Luu vet xac thuc On-chain (Cho muc dich bao mat he thong)
        isFundFromFactory[newFund] = true;

        // 5. Phat su kien de Backend FastAPI (Worker) nam bat va xu ly off-chain
        emit FundCreated(newFund, msg.sender, members, threshold, block.timestamp);
    }

    /**
     * @dev Nang cap template cho cac quy duoc tao trong tuong lai
     */
    function upgradeTemplate(address newTemplate) external onlyOwner {
        if (newTemplate == address(0) || newTemplate.code.length == 0) revert InvalidTemplate();
        if (newTemplate == activeVaultTemplate) revert InvalidTemplate();

        address oldTemplate = activeVaultTemplate;
        activeVaultTemplate = newTemplate;

        emit TemplateUpgraded(oldTemplate, newTemplate, block.timestamp);
    }

    // --- Cac ham quan tri rui ro ---

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}