# Budget Manager App - Tài liệu dự án

Dự án này là một hệ thống quản lý ngân sách nhóm tích hợp công nghệ Blockchain, cho phép người dùng quản lý tài chính một cách minh bạch và bảo mật thông qua ví điện tử (MetaMask).

---

## 1. Tổng quan dự án
Ứng dụng giúp các nhóm (gia đình, bạn bè, tổ chức) có thể:
- Đăng ký thành viên dựa trên địa chỉ ví Blockchain.
- Tạo các quỹ chung (Budgets) với mục đích cụ thể.
- Theo dõi số dư và quản lý quỹ một cách dân chủ.
- Thực hiện cơ chế phê duyệt đa bên (**Multi-sig**) thông qua các **Proposal**.

---

## 2. Công nghệ sử dụng
- **Backend**: FastAPI (Python), MongoDB (NoSQL).
- **Frontend**: HTML5, Vanilla CSS, JavaScript.
- **Blockchain**: MetaMask (Provider), Web3.py / Ethers.js (Verify Signature).
- **Cấu trúc**: 3-Layer Architecture (Router -> Service -> Model).

---

## 3. Kiến trúc hệ thống & Logic bảo mật

### 👤 Member vs Membership (Tách biệt dữ liệu)
- **Member**: Lưu trữ hồ sơ định danh (Tên, tuổi, email). Một ví chỉ đăng ký Member một lần duy nhất trên toàn hệ thống.
- **Membership**: Quản lý mối quan hệ giữa Member và Quỹ (Budget). Xử lý việc ai thuộc nhóm nào.

### 🗳️ Cơ chế Proposal (Trái tim của hệ thống)
Hệ thống không cho phép thay đổi quỹ một cách tùy tiện. Mọi hành động quan trọng đều phải qua 3 bước:
1. **Tạo Đề xuất (Create):** Một thành viên quỹ đề xuất thêm người hoặc chi tiền.
2. **Phê duyệt (Approve):** Các thành viên khác vào "ký tên" (Vote). Chỉ thành viên quỹ mới có quyền này.
3. **Thực thi (Execute):** Khi đủ số lượng chữ ký (ngưỡng Threshold), hệ thống mới chính thức thực hiện thay đổi.

---

## 4. Danh sách Use Cases (Nghiệp vụ)

### Nhóm 1: Định danh & Đăng ký
- **UC-01 (Register):** Người dùng dùng ví MetaMask ký thông điệp để đăng ký tài khoản.
- **UC-02 (Login):** Xác thực chủ sở hữu ví để vào Dashboard.

### Nhóm 2: Quản lý Quỹ (Budget)
- **UC-03 (Create Budget):** Tạo quỹ mới, thiết lập ngưỡng duyệt (ví dụ: cần 2/3 người đồng ý).
- **UC-04 (View Dashboard):** Xem danh sách các quỹ mình tham gia kèm tên thật của các thành viên khác.

### Nhóm 3: Quản lý Đề xuất (Proposal Management)
- **UC-05 (Member Proposal):** Đề xuất thêm/xóa thành viên vào quỹ.
- **UC-06 (Spending Proposal):** Đề xuất rút tiền chi tiêu từ quỹ chung.
- **UC-07 (Vote/Approve):** Thành viên quỹ bỏ phiếu cho đề xuất.
- **UC-08 (Finalize/Execute):** Tự động cập nhật dữ liệu khi đề xuất được thông qua.

---

## 5. Hướng dẫn cài đặt & Chạy dự án

### Chuẩn bị:
1. Cài đặt Python 3.9+.
2. Có sẵn MongoDB (Local hoặc Atlas).
3. Cài đặt ví MetaMask trên trình duyệt.

### Cài đặt Backend:
1. Di chuyển vào thư mục backend: `cd backend`
2. Cài đặt thư viện: `pip install -r requirements.txt`
3. Tạo file `.env` và cấu hình:
   ```env
   MONGO_URI=mongodb://localhost:27017
   MONGO_DB_NAME=budget_manager
   ```
4. Chạy server: `python app.py`

### Truy cập tài liệu API:
Mở trình duyệt truy cập: `http://localhost:8000/docs` để test các API thông qua giao diện Swagger UI.

---

## 6. Sơ đồ luồng xử lý (Logic Flow)
`Yêu cầu từ ví` -> `Xác thực chữ ký` -> `Kiểm tra quyền thành viên` -> `Ghi nhận đề xuất/Duyệt` -> `Cập nhật quỹ`.

**Dự án được thiết kế để đảm bảo: Tiền của nhóm chỉ được chi khi nhóm đồng ý!**
