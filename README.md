# Budget Manager App - Source Code Analysis & Architecture Logic

Tài liệu này phân tích chi tiết toàn bộ mã nguồn của dự án (Blockchain, Backend, Frontend) nhằm hỗ trợ việc viết Document (tài liệu kỹ thuật và hướng dẫn sử dụng) một cách dễ dàng và hệ thống.

---

## 1. Kiến Trúc Tổng Thể (System Architecture)

Dự án áp dụng mô hình **Hybrid (Off-chain & On-chain)** kết hợp **Gasless Meta-Transactions**:
- **On-chain (Blockchain):** Đảm bảo tính minh bạch, lưu trữ tiền thật (ETH/Token), và thực thi logic cốt lõi (rút tiền, giới hạn chi tiêu) dựa trên Multi-sig.
- **Off-chain (Backend/Database):** Xử lý UI, lưu trữ metadata (tên quỹ, thông tin user, lịch sử không ảnh hưởng số dư), thu thập chữ ký EIP-712 để giảm chi phí gas cho người dùng.
- **Relayer:** Backend đóng vai trò người thực thi (Relayer), thay mặt người dùng trả phí gas khi một đề xuất đạt đủ chữ ký (Gasless Voting).

---

## 2. Lớp Blockchain (Smart Contracts)

Nằm trong thư mục `blockchain/contracts/`. Các Smart Contract được viết bằng Solidity (^0.8.20).

### 2.1. `VaultFactory.sol` (Nhà Máy Tạo Quỹ)
- **Chức năng:** Tạo ra các quỹ (Vault) mới.
- **Logic hoạt động:**
  - Áp dụng pattern **EIP-1167 (Minimal Proxy / Clones)** để nhân bản contract `SharedVault` gốc thay vì deploy lại từ đầu -> **Tiết kiệm 90% phí Gas** khi tạo quỹ mới.
  - Cập nhật địa chỉ `ExpenseManager` tự động vào quỹ mới tạo.
  - Emit sự kiện `FundCreated` để Backend lắng nghe và đồng bộ dữ liệu vào MongoDB.

### 2.2. `SharedVault.sol` (Quỹ Đa Chữ Ký - Multi-Sig)
- **Chức năng:** Quản lý số dư và thực thi các giao dịch của một quỹ cụ thể.
- **Logic hoạt động:**
  - **Phân quyền:** Owner (người tạo), Member (thành viên có quyền biểu quyết).
  - **Gasless Voting (EIP-712):** Quá trình biểu quyết không tốn Gas. Người dùng ký số (signature) trên Frontend, Backend thu thập. Khi đủ ngưỡng (`threshold`), một người (hoặc hệ thống Relayer) sẽ gọi hàm `execute...` để submit tất cả chữ ký lên on-chain.
  - **Chức năng chính:**
    - `executeWithdraw`: Rút tiền. Tương tác với `ExpenseManager` để kiểm tra xem việc rút tiền có vi phạm giới hạn chi tiêu không.
    - `executeAddMember` / `executeRemoveMember`: Thêm bớt thành viên, yêu cầu đủ số lượng chữ ký.
    - `executeSetCategoryLimit`: Đặt giới hạn chi tiêu cho từng danh mục.
    - `executeCloseFund`: Đóng quỹ (bắt buộc phải có chữ ký của Owner).

### 2.3. `ExpenseManager.sol` (Quản Lý Hạn Mức Chi Tiêu)
- **Chức năng:** Giám sát và áp đặt hạn mức chi tiêu cho từng danh mục (category) của các Vault.
- **Logic hoạt động:**
  - Mô hình Registry: Quản lý tập trung hạn mức của nhiều Vault khác nhau.
  - **Bảo mật:** Sử dụng `onlyRegisteredVault` (dựa trên danh sách từ `VaultFactory`) để chỉ cho phép các Vault hợp lệ cập nhật dữ liệu chi tiêu.
  - Khi SharedVault gọi `validateTransaction`, contract này sẽ kiểm tra xem số tiền rút có vượt quá `limitAmount - amountSpent` không. Nếu vượt -> Giao dịch revert.

---

## 3. Lớp Backend (FastAPI + MongoDB)

Nằm trong thư mục `backend/`. 

### 3.1. Cấu Trúc Database (MongoDB)
- **budget:** Lưu thông tin quỹ (Tên, ID, Vault Address, Members, Balance tạm tính, Transactions log).
- **limit_proposals / withdraw_requests:** Lưu trữ các đề xuất rút tiền và đặt giới hạn. Ở đây chứa mảng `signatures` gom các chữ ký từ người dùng.
- **user:** Lưu thông tin người dùng (Address, Role, Name, tổng phí gas đã dùng).

### 3.2. Cơ chế Relayer (`service/relayer.py`)
- Đây là trái tim của tính năng Gasless.
- Chứa Private Key của một ví Admin hệ thống có sẵn ETH.
- Khi một đề xuất (`withdraw`, `set_limit`) trong DB đạt quá bán số lượng chữ ký (`> member_count / 2`), Backend sẽ gọi Relayer.
- Relayer dùng Web3.py kết hợp các chữ ký đã gom, build giao dịch, ký bằng ví Admin và gửi lên mạng Blockchain.
- **Gas Fee Accounting:** Hàm `_charge_gas_to_proposer` sẽ tính toán tiền gas Admin đã chịu và trừ vào "tài khoản ảo" của người đề xuất để hiển thị.

### 3.3. Các API Services chính (`service/budget.py`)
- **Tạo Quỹ (`create_budget`):** Sau khi Frontend gọi hợp đồng `VaultFactory` tạo quỹ thành công và có `tx_hash`, gửi thông tin cho Backend lưu vào DB.
- **Đề Xuất Rút Tiền (`create_withdraw_request`):** Tạo Request trạng thái `pending`. Gửi thông báo đến thành viên. Kiểm tra cảnh báo vượt hạn mức thông qua `relayer.get_category_info`.
- **Ký Đề Xuất (`add_withdraw_signature` / `add_limit_signature`):** 
  - Lưu chữ ký của member vào DB.
  - **Auto-Execution Logic:** Kiểm tra nếu số chữ ký `> (tổng member / 2)` -> Gọi Relayer thực thi lên Smart Contract. Nếu thành công -> Cập nhật trạng thái thành `executed`, cập nhật balance, ghi log.

---

## 4. Lớp Frontend (Vanilla JavaScript + Ethers.js)

Nằm trong thư mục `frontend/`. 

### 4.1. Kiến Trúc UI & UX
- Giao diện dạng Dashboard tài chính chuyên nghiệp.
- Không dùng framework nặng như React/Vue mà dùng Vanilla JS thuần kết nối DOM. Điều này cần quản lý state thủ công cẩn thận qua biến toàn cục (`_budgetCache`, v.v.).

### 4.2. Quản Lý Ví (Wallet Connection)
- `app.js` & `auth.js`: Khởi tạo Ethers.js, kiểm tra MetaMask. Xử lý logic đăng nhập/đăng ký bằng cách ký một chuỗi message để xác thực định danh (thay cho mật khẩu truyền thống).

### 4.3. Quản Lý Quỹ (`budget.js`)
- Render danh sách quỹ từ API. Lấy số dư thực tế từ Blockchain thông qua `getOnChainBalance()`.
- **Luồng Tạo Quỹ:** 
  1. Frontend gọi `VaultFactory.createFund()` qua MetaMask của người dùng. (Giai đoạn này user vẫn chịu phí Gas tạo quỹ ban đầu).
  2. Lắng nghe Event log để lấy `vaultAddress`.
  3. Gửi thông tin (tên, mô tả, vaultAddress, tx_hash) về Backend lưu trữ.

### 4.4. Đề Xuất & Biểu Quyết (`proposals.js`, `withdraw.js`, `limits.js`)
- Dùng **EIP-712 (Typed Data Signatures):** Khi member muốn rút tiền hoặc duyệt, Frontend tạo payload EIP-712 chuẩn xác với Smart Contract và gọi `eth_signTypedData_v4` qua MetaMask.
- Việc này chỉ tạo ra một thông báo ký trên ví MetaMask, **hoàn toàn không tốn phí Gas**.
- Sau khi có chữ ký, Frontend gửi về Backend (`/budgets/{id}/withdraw-requests/{req_id}/signatures`). Mọi việc submit on-chain sau đó do Backend (Relayer) lo.

---

## 5. Tổng Kết Luồng Hoạt Động (User Flow)

1. **Đăng nhập:** Mở App -> Kết nối MetaMask -> Nếu ví chưa đăng ký, tạo Profile (lưu MongoDB).
2. **Tạo Quỹ:** Tạo quỹ mới (User tốn gas tạo contract via Factory) -> Ra được SharedVault riêng -> Backend lưu thông tin.
3. **Thêm Thành Viên:** Admin/Owner tạo đề xuất thêm ví thành viên vào Vault -> Các thành viên hiện tại ký (Gasless) -> Backend Auto-execute.
4. **Nạp Tiền:** Bất cứ ai cũng có thể chuyển ETH trực tiếp vào Vault Address (hoặc qua UI `deposit.js`). Ghi nhận lịch sử về Backend.
5. **Cài Đặt Giới Hạn Chi Tiêu (Limits):** Owner tạo đề xuất Limit cho danh mục (ví dụ "Tiền điện": 1 ETH) -> Chờ đủ chữ ký -> Backend Relayer submit hàm `executeSetCategoryLimit` lên on-chain.
6. **Rút Tiền:** Member A đề xuất rút 0.5 ETH cho "Tiền điện" -> Member B, C vào xem. Nếu thấy hợp lý -> Ký xác nhận.
7. **Thực thi Rút:** Khi đủ chữ ký -> Backend tự gọi Blockchain `executeWithdraw`. Smart Contract kiểm tra chữ ký hợp lệ -> Kiểm tra ExpenseManager xem 0.5 ETH có vượt Limit 1 ETH không -> Nếu thoả mãn, ETH được chuyển trực tiếp từ Vault đến người nhận.

## 6. Điểm Nhấn Phục Vụ Việc Viết Document
- **Tính năng Gasless:** Nhấn mạnh việc người dùng chỉ tốn gas khi tạo quỹ ban đầu hoặc tự nạp tiền, còn lại thao tác biểu quyết (Voting) hoàn toàn miễn phí, cải thiện trải nghiệm người dùng Web3.
- **Smart Limit (Quản trị chi tiêu thông minh):** Sự phân tách xuất sắc giữa Contract giữ tiền (`SharedVault`) và Contract giám sát (`ExpenseManager`) giúp dễ dàng nâng cấp logic hạn mức sau này mà không ảnh hưởng an toàn quỹ.
- **Hybrid Security:** Contract đảm bảo không ai lấy được tiền trái phép kể cả khi Backend bị hack, Backend làm mượt trải nghiệm UI và tự động hoá việc gửi transaction.
