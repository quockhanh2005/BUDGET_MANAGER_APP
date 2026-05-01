// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ISharedVaultTemplate
 * @dev Interface tối thiểu để tương tác với các bản sao (clones) của SharedVault.
 * Hàm initialize đóng vai trò như constructor cho các proxy contract (EIP-1167).
 */
interface ISharedVaultTemplate {
    function initialize(address[] memory owners, uint256 threshold) external;
}

/**
 * @title WalletFactory
 * @author Codex Team
 * @notice Hệ thống quản lý và tạo ví đa chữ ký (Multi-sig) tự động cho người dùng.
 * @dev Hợp đồng này sử dụng mô hình Factory kết hợp với EIP-1167 (Minimal Proxy) để:
 * 1. Giảm thiểu chi phí Gas khi triển khai nhiều ví (chỉ deploy logic một lần).
 * 2. Quản lý tập trung toàn bộ danh sách ví trong hệ sinh thái.
 * 3. Hỗ trợ nâng cấp logic cho các ví mới thông qua cơ chế Template.
 * 4. Cung cấp khả năng truy vấn và phân trang dữ liệu hiệu quả cho Backend/UI.
 */
contract VaultFactory is Ownable, Pausable, ReentrancyGuard {
    using Clones for address;

    // --- Các lỗi tùy chỉnh (Custom Errors) ---
    error InvalidTemplate();           // Template không hợp lệ hoặc không có code
    error InvalidOwner();              // Địa chỉ owner không hợp lệ (ví dụ: address(0))
    error EmptyOwners();               // Danh sách owner rỗng
    error InvalidThreshold();          // Ngưỡng chữ ký không hợp lệ (0 hoặc > số owner)
    error DuplicateOwner();            // Trùng lặp địa chỉ owner trong danh sách
    error CreatorVaultLimitReached();  // Người dùng đã đạt giới hạn số lượng ví được tạo
    error VaultNotFound();             // Không tìm thấy thông tin ví trong registry

    // --- Các hằng số nghiệp vụ (Business Constants) ---
    /// @notice Giới hạn số lượng owner tối đa để tránh lỗi Out-of-Gas khi thực hiện giao dịch.
    uint256 public constant MAX_OWNERS = 20;
    /// @notice Giới hạn số lượng ví mỗi user có thể tạo để ngăn chặn spam hệ thống.
    uint256 public constant MAX_VAULTS_PER_USER = 50;

    /// @notice Địa chỉ của template SharedVault đầu tiên (dùng cho mục đích audit).
    address public immutable initialVaultTemplate;
    /// @notice Địa chỉ của template hiện tại đang được dùng để tạo các ví mới.
    address public activeVaultTemplate;
    /// @notice Tổng số lượng ví đã được khởi tạo từ Factory này.
    uint256 public totalVaultCount;

    // --- Cấu trúc dữ liệu và Lưu trữ (State Storage) ---
    /// @dev Ánh xạ địa chỉ user tới danh sách các ví mà họ là thành viên (owner).
    mapping(address => address[]) private userVaults;
    /// @dev Đánh dấu các ví được tạo từ Factory này để kiểm tra tính xác thực (authenticity).
    mapping(address => bool) public isVaultFromFactory;
    /// @dev Theo dõi số lượng ví mà một địa chỉ cụ thể đã khởi tạo.
    mapping(address => uint256) public vaultCountByCreator;
    /// @dev Lưu trữ thông tin chi tiết (metadata) của từng ví được tạo.
    mapping(address => VaultRecord) private vaultRegistry;

    /// @dev Danh sách mảng phẳng chứa toàn bộ địa chỉ ví để hỗ trợ việc phân trang.
    address[] private allVaults;

    /**
     * @dev Cấu trúc lưu trữ thông tin cơ bản của một ví.
     * Sử dụng các kiểu dữ liệu nhỏ (uint64, uint32) để tối ưu hóa việc đóng gói dữ liệu (Storage Packing).
     */
    struct VaultRecord {
        address creator;    // Địa chỉ người đã gọi hàm tạo ví
        uint64 createdAt;   // Thời điểm ví được tạo (Unix timestamp)
        uint32 threshold;   // Ngưỡng chữ ký cần thiết để thực thi giao dịch
        bool exists;        // Cờ kiểm tra sự tồn tại của bản ghi
    }

    /**
     * @notice Sự kiện kích hoạt khi một ví mới được tạo thành công.
     * @param vaultAddress Địa chỉ của ví proxy vừa được triển khai.
     * @param creator Địa chỉ người thực hiện lệnh tạo.
     * @param owners Danh sách các địa chỉ sở hữu ví.
     * @param threshold Ngưỡng chữ ký yêu cầu.
     * @param timestamp Thời điểm tạo.
     */
    event VaultCreated(
        address indexed vaultAddress,
        address indexed creator,
        address[] owners,
        uint256 threshold,
        uint256 timestamp
    );

    /**
     * @notice Sự kiện khi Admin cập nhật template mới cho hệ thống.
     * @param oldTemplate Địa chỉ template cũ.
     * @param newTemplate Địa chỉ template mới.
     * @param timestamp Thời điểm cập nhật.
     */
    event TemplateUpgraded(
        address indexed oldTemplate,
        address indexed newTemplate,
        uint256 timestamp
    );

    event FactoryPaused(address indexed by, uint256 timestamp);
    event FactoryUnpaused(address indexed by, uint256 timestamp);

    /**
     * @notice Khởi tạo Factory với một template logic ban đầu.
     * @param vaultTemplate Địa chỉ của contract SharedVault (Logic) đã được deploy.
     * @param initialOwner Địa chỉ Admin nắm quyền điều hành Factory (thường là Multisig của team).
     */
    constructor(address vaultTemplate, address initialOwner) Ownable(initialOwner) {
        if (vaultTemplate == address(0) || vaultTemplate.code.length == 0) revert InvalidTemplate();
        if (initialOwner == address(0)) revert InvalidOwner();

        initialVaultTemplate = vaultTemplate;
        activeVaultTemplate = vaultTemplate;
    }

    /**
     * @notice Tạo một ví Shared Vault mới cho một nhóm người dùng.
     * @dev Quy trình thực hiện:
     * 1. Kiểm tra tính hợp lệ của đầu vào và giới hạn người tạo.
     * 2. Kiểm tra trùng lặp owner để đảm bảo logic đa chữ ký hoạt động chính xác.
     * 3. Sử dụng Clones.clone() để tạo bản sao proxy (EIP-1167).
     * 4. Gọi initialize() trên ví mới để thiết lập danh sách owner và ngưỡng chữ ký.
     * 5. Lưu trữ metadata vào registry và cập nhật quan hệ người dùng.
     * @param owners Danh sách các địa chỉ đồng sở hữu ví.
     * @param threshold Số lượng chữ ký tối thiểu để thực hiện giao dịch (m-of-n).
     * @return newVault Địa chỉ của ví vừa được tạo.
     */
    function createVault(address[] calldata owners, uint256 threshold)
        external
        whenNotPaused
        nonReentrant
        returns (address newVault)
    {
        uint256 ownerCount = owners.length;

        // --- Kiểm tra các ràng buộc nghiệp vụ (Validations) ---
        if (ownerCount == 0) revert EmptyOwners();
        if (ownerCount > MAX_OWNERS) revert InvalidThreshold();
        if (threshold == 0 || threshold > ownerCount) revert InvalidThreshold();
        if (vaultCountByCreator[msg.sender] >= MAX_VAULTS_PER_USER) revert CreatorVaultLimitReached();

        // Kiểm tra tính hợp lệ và duy nhất của Owners (Tránh lỗi logic đa chữ ký)
        for (uint256 i = 0; i < ownerCount; ) {
            address currentOwner = owners[i];
            if (currentOwner == address(0)) revert InvalidOwner();

            // Kiểm tra trùng lặp: O(n^2) - chấp nhận được vì n tối đa chỉ là 20.
            // Cách tiếp cận này tiết kiệm Gas hơn so với dùng mapping tạm thời trong memory.
            for (uint256 j = i + 1; j < ownerCount; ) {
                if (currentOwner == owners[j]) revert DuplicateOwner();
                unchecked {
                    ++j;
                }
            }

            unchecked {
                ++i;
            }
        }

        // Kiểm tra an toàn template trước khi clone
        if (activeVaultTemplate.code.length == 0) revert InvalidTemplate();

        // --- Hành động cốt lõi: EIP-1167 Clone ---
        newVault = activeVaultTemplate.clone();
        
        // Khởi tạo ví ngay lập tức (Cực kỳ quan trọng để thiết lập quyền sở hữu)
        ISharedVaultTemplate(newVault).initialize(owners, threshold);

        // --- Quản lý Trạng thái (State Management) ---
        vaultRegistry[newVault] = VaultRecord({
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            threshold: uint32(threshold),
            exists: true
        });

        // Cập nhật quan hệ User <-> Vault để hiển thị trên UI cá nhân
        for (uint256 i = 0; i < ownerCount; ) {
            userVaults[owners[i]].push(newVault);
            unchecked {
                ++i;
            }
        }

        allVaults.push(newVault);
        isVaultFromFactory[newVault] = true;
        vaultCountByCreator[msg.sender] += 1;
        totalVaultCount += 1;

        emit VaultCreated(newVault, msg.sender, owners, threshold, block.timestamp);
    }

    /**
     * @notice Lấy danh sách tất cả các ví mà một người dùng đang tham gia (là owner).
     * @param user Địa chỉ người dùng cần truy vấn.
     * @return address[] Mảng các địa chỉ ví.
     */
    function getUserVaults(address user) external view returns (address[] memory) {
        if (user == address(0)) revert InvalidOwner();
        return userVaults[user];
    }

    /**
     * @notice Lấy thông tin Metadata của một ví cụ thể từ Registry của Factory.
     * @dev Giúp Backend/UI lấy nhanh thông tin mà không cần gọi trực tiếp vào ví clone.
     * @param vault Địa chỉ ví cần lấy thông tin.
     * @return creator Địa chỉ người tạo.
     * @return threshold Ngưỡng chữ ký.
     * @return createdAt Thời điểm tạo.
     */
    function getVaultInfo(address vault)
        external
        view
        returns (address creator, uint256 threshold, uint256 createdAt)
    {
        VaultRecord memory record = vaultRegistry[vault];
        if (!record.exists) revert VaultNotFound();
        return (record.creator, record.threshold, record.createdAt);
    }

    /**
     * @notice Truy vấn danh sách toàn bộ ví theo kiểu phân trang.
     * @dev Tránh lỗi timeout hoặc vượt giới hạn Gas khi hệ thống có số lượng ví cực lớn.
     * @param offset Vị trí bắt đầu lấy trong mảng allVaults.
     * @param limit Số lượng ví tối đa muốn lấy trong một trang.
     * @return page Danh sách địa chỉ ví trong trang yêu cầu.
     * @return total Tổng số lượng ví hiện có trên hệ thống.
     */
    function getVaultsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory page, uint256 total)
    {
        total = allVaults.length;
        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 count = end - offset;
        page = new address[](count);

        for (uint256 i = 0; i < count; ) {
            page[i] = allVaults[offset + i];
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Nâng cấp mẫu ví cho các lần tạo mới sau này.
     * @dev Chỉ Admin mới có quyền gọi hàm này. Cho phép vá lỗi hoặc thêm tính năng mới cho các ví tương lai.
     * Lưu ý quan trọng: Các ví đã được tạo trước đó sẽ vẫn giữ nguyên logic cũ (Immutable).
     * @param newTemplate Địa chỉ của contract template logic mới.
     */
    function upgradeTemplate(address newTemplate) external onlyOwner {
        if (newTemplate == address(0) || newTemplate.code.length == 0) revert InvalidTemplate();
        if (newTemplate == activeVaultTemplate) revert InvalidTemplate();

        address oldTemplate = activeVaultTemplate;
        activeVaultTemplate = newTemplate;

        emit TemplateUpgraded(oldTemplate, newTemplate, block.timestamp);
    }

    /// @notice Tạm dừng hoạt động tạo ví mới (Emergency Stop).
    function pause() external onlyOwner {
        _pause();
        emit FactoryPaused(msg.sender, block.timestamp);
    }

    /// @notice Khôi phục hoạt động tạo ví mới.
    function unpause() external onlyOwner {
        _unpause();
        emit FactoryUnpaused(msg.sender, block.timestamp);
    }
}