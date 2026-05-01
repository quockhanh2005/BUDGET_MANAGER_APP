# Budget Manager App - Tài liệu dự án (Luan)

Dự án này là một hệ thống quản lý ngân sách nhóm tích hợp công nghệ Blockchain, cho phép người dùng quản lý tài chính một cách minh bạch và bảo mật thông qua ví điện tử (MetaMask).

## 1. Tổng quan dự án
Ứng dụng giúp các nhóm (gia đình, bạn bè, tổ chức) có thể:
- Đăng ký thành viên dựa trên địa chỉ ví Blockchain.
- Tạo các quỹ chung (Budgets) với mục đích cụ thể.
- Theo dõi số dư và lịch sử giao dịch trực tiếp từ mạng lưới Ethereum.
- Thực hiện cơ chế phê duyệt đa bên (Multi-sig) thông qua các Proposal.

## 2. Công nghệ sử dụng
- **Backend**: FastAPI (Python), MongoDB.
- **Frontend**: HTML5, Vanilla CSS, JavaScript, MetaMask.
- **Blockchain Interface**: Web3.py / Ethers.js.

## 3. Kiến trúc phân tách Member & Membership (Đặc biệt)
Dự án được thiết kế tách biệt giữa thông tin cá nhân và quan hệ nhóm để đảm bảo tính bảo mật và dễ mở rộng:

- **Member (`member.py`)**: Quản lý **Hồ sơ cá nhân** (Tên thật, CCCD, Tuổi). Đây là dữ liệu dùng chung toàn hệ thống.
- **Membership (`membership.py`)**: Quản lý **Quan hệ hội viên** trong từng Quỹ. File này xử lý các nghiệp vụ thêm/xóa thành viên và xem danh sách quỹ tham gia.

### Cơ chế đồng bộ hóa dữ liệu:
Mặc dù tách rời, nhưng hai phần này được đồng bộ chặt chẽ:
1. **Tra cứu Tên thật**: Khi xem chi tiết quỹ, hệ thống tự động tìm trong bảng Member để lấy tên thật hiển thị thay vì chỉ hiện địa chỉ ví.
2. **Kiểm tra đăng ký**: Không thể thêm một ví vào Quỹ nếu ví đó chưa đăng ký thông tin Member (chống người lạ trà trộn).

## 4. Danh sách Use Cases (Nghiệp vụ hệ thống)

### Nhóm 1: Quản lý thông tin và thành viên
- **UC-MEMBER-01 (Xem danh sách quỹ)**: Xem tất cả các quỹ mà mình đang tham gia.
- **UC-MEMBER-02 (Xem chi tiết quỹ)**: Xem thông tin chi tiết: người tạo, danh sách thành viên (có tên thật), ngưỡng duyệt, số dư.
- **UC-MEMBER-06 (Tạo proposal thêm thành viên)**: Đề xuất thêm thành viên mới (Yêu cầu người đó phải có tài khoản Member).
- **UC-MEMBER-07 (Tạo proposal xóa thành viên)**: Đề xuất loại bỏ thành viên khỏi quỹ.

### Nhóm 2: Giao dịch và Tài chính (Đang phát triển)
- **UC-MEMBER-03 (Nạp tiền vào quỹ)**: Chuyển tiền và đồng bộ số dư.
- **UC-MEMBER-04 (Tạo yêu cầu rút tiền)**: Tạo proposal chi tiêu tiền từ quỹ.
- **UC-MEMBER-05 (Ký xác thực proposal)**: Ký duyệt yêu cầu.

## 5. Danh sách các file Backend mới (Nhóm 1)
- `backend/models/membership.py`: Cấu trúc dữ liệu Member & Proposal.
- `backend/service/membership.py`: Logic đồng bộ và xử lý nghiệp vụ.
- `backend/api/membership.py`: Các endpoint API cho Frontend.

## 6. Hướng dẫn cài đặt và chạy dự án
1. Kích hoạt venv: `.\venv\Scripts\activate`
2. Cài đặt thư viện: `pip install -r requirements.txt`
3. Chạy server: `python -m backend.app`
4. Mở Frontend: `index.html` qua Live Server (Port 5500).

---
*Tài liệu này được cập nhật để phản ánh kiến trúc đồng bộ giữa Member và Membership.*
