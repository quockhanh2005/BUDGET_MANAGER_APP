// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IVaultFactory
 * @dev Giao dien toi thieu cua VaultFactory de xac thuc Vault hop le.
 */
interface IVaultFactory {
    function isFundFromFactory(address vault) external view returns (bool);
}

/**
 * @title ExpenseManager
 * @dev Hop dong quan ly han muc chi tieu theo danh muc cho cac Quy (SharedVault).
 *      Hoat dong theo mo hinh Registry, ho tro nhieu Vault cung luc.
 *      Chi cac Vault duoc tao tu VaultFactory moi co quyen ghi du lieu.
 */
contract ExpenseManager {

    // --- Lien ket voi VaultFactory de xac thuc Access Control ---
    IVaultFactory public immutable vaultFactory;

    // Cau truc du lieu quan ly han muc cho tung danh muc
    struct CategoryLimit {
        uint256 limitAmount;  // Han muc toi da duoc phep chi tieu (tinh bang Wei)
        uint256 amountSpent;  // Tong so tien da giai ngan
        bool isActive;        // Trang thai hoat dong cua danh muc
    }

    // Anh xa 2 chieu: Dia chi Vault => Category ID => Thong tin han muc
    mapping(address => mapping(uint256 => CategoryLimit)) public vaultCategories;

    // --- Khai bao Su kien (Events) ---
    // Phuc vu cho viec dong bo du lieu ve MongoDB va phan tich Data Science
    event CategoryLimitUpdated(
        address indexed vault, 
        uint256 indexed categoryId, 
        uint256 newLimit, 
        uint256 timestamp
    );
    
    event ExpenseValidated(
        address indexed vault, 
        uint256 indexed categoryId, 
        uint256 amount, 
        uint256 totalSpent,
        string message
    );

    event VaultActivity(
        address indexed vault,
        string activityType,
        uint256 categoryId,
        uint256 amount,
        address actor
    );

    // --- Modifier ---
    /**
     * @dev Bao ve cac ham ghi: Chi cac Vault duoc tao tu VaultFactory moi duoc goi.
     *      Ngan chan EOA hoac hop dong tuy y tuy chinh du lieu cua he thong.
     */
    modifier onlyRegisteredVault() {
        require(
            vaultFactory.isFundFromFactory(msg.sender),
            "ExpenseManager: Caller khong phai Vault hop le"
        );
        _;
    }

    /**
     * @dev Khoi tao hop dong voi dia chi VaultFactory.
     * @param _vaultFactory Dia chi cua VaultFactory da deploy
     */
    constructor(address _vaultFactory) {
        require(_vaultFactory != address(0), "ExpenseManager: Factory address khong hop le");
        vaultFactory = IVaultFactory(_vaultFactory);
    }

    /**
     * @dev Thiet lap hoac cap nhat han muc chi tieu.
     *      Chi Vault hop le (duoc tao boi VaultFactory) moi co the goi.
     *      Xu ly truong hop khan cap bang cach goi ham nay de nang han muc.
     * @param _categoryId Ma danh muc (Doi chieu voi MongoDB)
     * @param _limitAmount Han muc moi (Wei) — phai lon hon 0
     */
    function setCategoryLimit(uint256 _categoryId, uint256 _limitAmount) external onlyRegisteredVault {
        require(_limitAmount > 0, "ExpenseManager: Han muc phai lon hon 0");

        CategoryLimit storage category = vaultCategories[msg.sender][_categoryId];
        
        category.limitAmount = _limitAmount;
        category.isActive = true;
        
        emit CategoryLimitUpdated(msg.sender, _categoryId, _limitAmount, block.timestamp);
        emit VaultActivity(msg.sender, "SET_LIMIT", _categoryId, _limitAmount, tx.origin);
    }

    /**
     * @dev Vo hieu hoa mot danh muc khi khong con nhu cau su dung.
     *      Chi Vault so huu danh muc do moi duoc phep vo hieu hoa.
     * @param _categoryId Ma danh muc can vo hieu hoa
     */
    function deactivateCategory(uint256 _categoryId) external onlyRegisteredVault {
        require(vaultCategories[msg.sender][_categoryId].isActive, "ExpenseManager: Danh muc da bi vo hieu hoa");
        vaultCategories[msg.sender][_categoryId].isActive = false;
    }

    /**
     * @dev Kiem duyet giao dich giai ngan.
     *      Goi tu SharedVault truoc khi thuc hien lenh chuyen tien (.call).
     *      Chi Vault hop le moi duoc goi — ngan gia mao thong ke.
     * @param _categoryId Ma danh muc can kiem tra
     * @param _amount So tien yeu cau rut (Wei)
     * @return bool Tra ve true neu hop le, revert neu vi pham
     */
    function validateTransaction(uint256 _categoryId, uint256 _amount) external onlyRegisteredVault returns (bool) {
        CategoryLimit storage category = vaultCategories[msg.sender][_categoryId];

        // 1. Kiem tra trang thai hoat dong
        require(category.isActive, "ExpenseManager: Tu choi -- Danh muc khong hoat dong");

        // 2. Kiem tra gioi han tai chinh (Hard Limit)
        require(
            category.amountSpent + _amount <= category.limitAmount,
            "ExpenseManager: Tu choi -- Vuot qua han muc danh muc"
        );

        // 3. Cap nhat trang thai va ghi nhan (Checks-Effects-Interactions pattern)
        category.amountSpent += _amount;

        emit ExpenseValidated(msg.sender, _categoryId, _amount, category.amountSpent, "Chi tieu hop le");
        emit VaultActivity(msg.sender, "WITHDRAW", _categoryId, _amount, tx.origin);
        
        return true;
    }

    /**
     * @dev Ham View de ho tro Frontend/Backend truy van nhanh thong tin ngan sach.
     *      Khong gio han caller — ai cung doc duoc (read-only, khong anh huong bao mat).
     * @param _vault Dia chi cua Quy can kiem tra
     * @param _categoryId Ma danh muc can kiem tra
     */
    function getCategoryInfo(address _vault, uint256 _categoryId) 
        external 
        view 
        returns (
            uint256 limitAmount, 
            uint256 amountSpent, 
            uint256 remaining, 
            bool isActive
        ) 
    {
        CategoryLimit memory category = vaultCategories[_vault][_categoryId];
        
        uint256 remain = 0;
        if (category.limitAmount > category.amountSpent) {
            remain = category.limitAmount - category.amountSpent;
        }

        return (category.limitAmount, category.amountSpent, remain, category.isActive);
    }
}