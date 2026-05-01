# Budget Manager App

Ứng dụng quản lý ngân sách (Budget Manager) tích hợp blockchain, sử dụng FastAPI cho backend và Vanilla JS cho frontend.

## 📂 Cấu trúc mã nguồn

```text
BUDGET_MANAGER_APP/
├── backend/            # Mã nguồn Python (FastAPI)
│   ├── api/            # Các route API (member, v.v.)
│   ├── models/         # Định nghĩa schema/models (Pydantic/MongoDB)
│   ├── service/        # Logic nghiệp vụ (Business logic)
│   ├── utils/          # Các tiện ích (Kết nối DB, v.v.)
│   └── app.py          # Entry point của backend
├── frontend/           # Giao diện người dùng (HTML/JS/CSS)
│   ├── index.html      # Trang chính
│   ├── app.js          # Logic xử lý frontend và kết nối MetaMask
│   └── styles.css      # Giao diện ứng dụng
├── blockchain/         # Smart contracts (Solidity) và scripts liên quan
├── .venv/              # Môi trường ảo Python
├── requirements.txt    # Danh sách thư viện backend
└── .env                # Biến môi trường (DB URL, Private keys, v.v.)
```

---

## 🚀 Hướng dẫn chạy ứng dụng

Cần chạy đồng thời cả Backend và Frontend để ứng dụng hoạt động đầy đủ.

### 1. Chạy Backend (Python FastAPI)

Đảm bảo bạn đang ở thư mục gốc của dự án (`BUDGET_MANAGER_APP`).

**Bước 1: Kích hoạt môi trường ảo**

- Trên Linux/macOS:
  ```bash
  source .venv/bin/activate
  ```
- Trên Windows:
  ```bash
  .venv\Scripts\activate
  ```

**Bước 2: Cài đặt dependencies (nếu chưa có)**

```bash
pip install -r requirements.txt
```

**Bước 3: Khởi chạy Server**

```bash
python3 -m backend.app
```

Hoặc sử dụng uvicorn trực tiếp:

```bash
uvicorn backend.app:app --reload --port 8000
```

Backend sẽ chạy tại: `http://localhost:8000`

---

### 2. Chạy Frontend (Vanilla JS)

Vì frontend là các tệp tĩnh (static files), bạn có thể chạy bằng bất kỳ trình duyệt nào, nhưng khuyến khích sử dụng một web server đơn giản để tránh lỗi CORS hoặc lỗi đường dẫn.

**Cách 1: Sử dụng Python (Đơn giản nhất)**
Mở một terminal mới tại thư mục gốc và chạy:

```bash
python3 -m http.server -d frontend 5500
```

Frontend sẽ chạy tại: `http://localhost:5500`

**Cách 2: Sử dụng Live Server (VS Code)**

- Mở thư mục `frontend` trong VS Code.
- Click chuột phải vào `index.html` và chọn **Open with Live Server**.

---

## 🛠 Yêu cầu hệ thống

- **Python**: 3.8 trở lên.
- **Trình duyệt**: Chrome/Brave/Edge có cài đặt **MetaMask extension**.
- **Cấu hình**: Cập nhật các thông số cần thiết trong tệp `.env` ở thư mục gốc và `backend/`.

## 📝 Lưu ý

- Đảm bảo Backend đã chạy trước khi thao tác trên Frontend để các yêu cầu API không bị lỗi.
- Kiểm tra cấu hình kết nối MongoDB và Blockchain trong tệp `.env`.


# Tài liệu Kiến trúc Hệ thống & Vận hành: Budget Manager App

Dự án quản lý ngân sách (Budget Manager) tích hợp blockchain hoạt động theo mô hình Hybrid (Web2.5). Nền tảng kết hợp sự tiện lợi của Web2 cho tài chính cá nhân và tính minh bạch, an toàn của Web3 cho quản lý quỹ chung.

## 1. Tổng quan Kiến trúc Hệ thống

Hệ thống được thiết kế theo mô hình phân tầng "Ví trong Ví" (Two-Tier Wallet System), tách biệt rõ ràng luồng xử lý Off-chain và On-chain:

- **Lớp 1 - Ví App Cá nhân (Off-chain):** Được vận hành bởi Backend (FastAPI) và cơ sở dữ liệu (MongoDB). Lớp này đóng vai trò xử lý các giao dịch cá nhân và luân chuyển nội bộ với tốc độ tức thì, không tốn phí mạng lưới (Gas) và bảo vệ tuyệt đối quyền riêng tư dữ liệu của người dùng.
- **Lớp 2 - Quỹ Nhóm (On-chain):** Được quản lý hoàn toàn bởi hệ thống Smart Contract (Solidity). Lớp này hoạt động như một két sắt chung, đảm bảo sự minh bạch, phi tập trung và thực thi nghiêm ngặt các quy tắc phân quyền rút tiền (Multi-sig).

---

## 2. Đi sâu Phân tích Cơ chế Vận hành

### 2.1. Cơ chế Định danh và Xác thực (Authentication)
- **MetaMask làm Định danh cốt lõi:** Địa chỉ ví (Public Address) được trích xuất từ MetaMask đóng vai trò là khóa chính (Primary Key) duy nhất để định danh người dùng trong toàn bộ hệ thống.
- **Xác thực Off-chain (Passwordless):** Hệ thống loại bỏ việc sử dụng mật khẩu truyền thống. Khi đăng nhập, Backend tạo ra một mã Nonce ngẫu nhiên. Người dùng sử dụng Private Key trên MetaMask để ký mã Nonce này (Sign Message). Backend đối chiếu chữ ký bằng thuật toán mã hóa đường cong elliptic (ECDSA). Nếu hợp lệ, phiên làm việc (JWT Token) được cấp. Quá trình này diễn ra an toàn và hoàn toàn miễn phí Gas.

### 2.2. Cơ chế Quản lý Ví Cá nhân (App Wallet)
Ví cá nhân hiển thị trên ứng dụng thực chất là số dư được ghi nhận trong cơ sở dữ liệu, hoạt động song song với một Ví Tổng (Treasury Wallet) do hệ thống nắm giữ.
- **Nạp tiền (Deposit):** Người dùng thực hiện giao dịch chuyển tài sản từ ví MetaMask cá nhân vào Ví Tổng của hệ thống. Dịch vụ nền (Worker) của Backend sẽ lắng nghe sự kiện trên mạng lưới và tự động cộng số dư tương ứng vào cơ sở dữ liệu.
- **Chuyển tiền nội bộ (Internal Transfer):** Việc luân chuyển tài sản giữa người dùng A và B được thực hiện hoàn toàn bằng các phép toán cộng/trừ trên MongoDB. Giao dịch được xử lý trong vài mili-giây và không phát sinh phí mạng lưới.
- **Rút tiền (Withdraw):** Backend kiểm tra và trừ số dư trong cơ sở dữ liệu, sau đó điều khiển Ví Tổng tạo một giao dịch On-chain để trả tài sản về địa chỉ MetaMask đích của người dùng.

### 2.3. Cơ chế Quản lý Quỹ Nhóm (Group Fund Mechanism)
Đây là phân hệ cốt lõi tương tác trực tiếp với Smart Contract, yêu cầu tính minh bạch tuyệt đối.
- **Khởi tạo Quỹ (EIP-1167 Minimal Proxy):** Thay vì triển khai (deploy) một hợp đồng hoàn toàn mới gây tốn kém, hệ thống sử dụng `FundFactory` để nhân bản hợp đồng `FundVault` theo chuẩn Minimal Proxy. Mỗi quỹ sinh ra có một địa chỉ ví và vùng lưu trữ (Storage) hoàn toàn độc lập, nhưng dùng chung logic mã nguồn, giúp giảm thiểu 90% chi phí Gas.
- **Nạp tiền vào Quỹ:** Cung cấp hai luồng vận hành song song:
  1. *Luồng Off-chain (Qua Ví App):* Backend trừ số dư trong cơ sở dữ liệu của thành viên, sử dụng Ví Tổng để nạp tiền vào Smart Contract của Quỹ, đồng thời gọi hàm định danh (`depositFor`) để ghi nhận quyền lợi trực tiếp cho thành viên đó.
  2. *Luồng On-chain (Qua MetaMask):* Thành viên kết nối trực tiếp ví MetaMask và gọi hàm `deposit()` trên Smart Contract. Người dùng tự chi trả phí Gas cho mạng lưới.
- **Rút tiền Đa chữ ký (Hybrid Off-chain Multi-sig):** Áp dụng chuẩn EIP-712 để giải quyết bài toán chi phí cho việc đồng thuận:
  1. *Đề xuất và Bỏ phiếu Off-chain:* Quản trị viên khởi tạo yêu cầu rút tiền. Các quản trị viên khác duyệt yêu cầu bằng cách ký thông điệp (Sign Message) trên MetaMask. Các chữ ký số này được gửi và lưu trữ tại Backend mà không tốn phí Gas.
  2. *Thực thi On-chain:* Khi số lượng chữ ký đạt ngưỡng đồng thuận (Threshold), một quản trị viên sẽ gọi hàm thực thi duy nhất trên Smart Contract, đính kèm mảng dữ liệu chứa toàn bộ chữ ký hợp lệ. Smart Contract sử dụng hàm `ecrecover` để xác thực tính toàn vẹn của từng chữ ký trước khi giải ngân.

---

## 3. Cấu trúc Mã nguồn

Dự án được tổ chức theo cấu trúc Hybrid chuẩn mực:
```text
BUDGET_MANAGER_APP/
├── backend/            # Mã nguồn Python (FastAPI)
│   ├── api/            # Các route API (member, v.v.)
│   ├── models/         # Định nghĩa schema/models (Pydantic/MongoDB)
│   ├── service/        # Logic nghiệp vụ (Business logic)
│   ├── utils/          # Các tiện ích (Kết nối DB, v.v.)
│   └── app.py          # Entry point của backend
├── frontend/           # Giao diện người dùng (HTML/JS/CSS)
│   ├── index.html      # Trang chính
│   ├── app.js          # Logic xử lý frontend và kết nối MetaMask
│   └── styles.css      # Giao diện ứng dụng
├── blockchain/         # Môi trường Hardhat (Smart Contracts, test, scripts)
├── .venv/              # Môi trường ảo Python
├── requirements.txt    # Danh sách thư viện backend
└── .env                # Biến môi trường (DB URL, Private keys, v.v.)