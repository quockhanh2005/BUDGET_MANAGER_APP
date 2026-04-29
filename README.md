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