# Budget Manager App — Comprehensive Technical Reference (v3.0)

> **Phiên bản tài liệu:** 3.0 | **Cập nhật lần cuối:** 05/2026  
> Tài liệu kỹ thuật chuẩn tổng hợp dành cho toàn bộ thành viên trong team — Backend, Frontend, Blockchain và ML/Data. Đây là phiên bản được gộp từ các tài liệu kiến trúc hệ thống (`README_v2.md`), tài liệu Smart Contract (`README_SC.md`) và báo cáo tích hợp (`read.md`).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Repository Structure](#3-repository-structure)
4. [Module: Backend (FastAPI)](#4-module-backend-fastapi)
5. [Module: Frontend (Vanilla JS)](#5-module-frontend-vanilla-js)
6. [Module: Blockchain (Hardhat + Solidity)](#6-module-blockchain-hardhat--solidity)
7. [Environment & Configuration](#7-environment--configuration)
8. [Development Setup — Getting Started](#8-development-setup--getting-started)
9. [Git Workflow & Contribution Guidelines](#9-git-workflow--contribution-guidelines)
10. [Roadmap & Status](#10-roadmap--status)

---

## 1. Project Overview

**Budget Manager App** là một ứng dụng quản lý ngân sách cá nhân và quỹ nhóm tích hợp blockchain, hoạt động theo mô hình **Web2.5 Hybrid**. Hệ thống kết hợp sự tiện lợi của Web2 với tính minh bạch, bất biến và bảo mật của Web3.

| Thuộc tính | Mô tả |
|---|---|
| **Kiến trúc** | Hybrid Web2.5 (Off-chain + On-chain) |
| **Backend** | Python 3.10+ / FastAPI / MongoDB |
| **Frontend** | Vanilla JS / HTML5 / CSS3 / MetaMask |
| **Blockchain** | Solidity ^0.8.20 / Hardhat / OpenZeppelin v4 |
| **ML/Data** | PyTorch / Faster R-CNN / ISIC Dataset |
| **Mạng blockchain** | Local (Hardhat), Sepolia Testnet |

### Vấn đề nghiệp vụ được giải quyết

```
Quản lý tài chính cá nhân (App Wallet)   →  Tức thì, miễn phí Gas, riêng tư
Quản lý quỹ nhóm có đồng thuận           →  Minh bạch, bất biến, chống gian lận
Xác thực định danh không mật khẩu        →  Bảo mật, đơn giản, dùng MetaMask
Quản lý hạn mức chi tiêu tự động         →  Kiểm soát ngân sách qua Smart Contract
```

---

## 2. System Architecture

### 2.1 Mô hình phân tầng "Ví trong Ví" (Two-Tier Wallet)

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER (MetaMask)                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
           ┌───────────────────▼───────────────────┐
           │        FRONTEND (Vanilla JS)           │
           │   MetaMask SDK  ·  REST API calls      │
           └───────────────────┬───────────────────┘
                               │
       ┌───────────────────────▼───────────────────────┐
       │              BACKEND (FastAPI)                 │
       │  ┌─────────────┐    ┌──────────────────────┐  │
       │  │   MongoDB   │    │  Treasury Wallet     │  │
       │  │  (Off-chain │    │  (Web3.py / eth-     │  │
       │  │   Ledger)   │    │   account)           │  │
       │  └─────────────┘    └──────────┬───────────┘  │
       └─────────────────────────────── │ ─────────────┘
                                        │ (On-chain calls)
       ┌────────────────────────────────▼──────────────────────────────┐
       │              BLOCKCHAIN (Ethereum / Sepolia)                   │
       │                                                               │
       │  ┌─────────────────┐       ┌─────────────────┐                │
       │  │  VaultFactory   │───▶   │  SharedVault    │                │
       │  │  (EIP-1167)     │ clone │  (Clone/Proxy)  │                │
       │  └─────────────────┘       └────────┬────────┘                │
       │           │                         │                         │
       │      xác thực vault                 │ validateTransaction     │
       │           │                         ▼                         │
       │           └────────────────▶  ExpenseManager                  │
       │                              (Registry Pattern)               │
       └───────────────────────────────────────────────────────────────┘
```

### 2.2 Hai luồng xử lý cốt lõi

| | Lớp 1: App Wallet (Off-chain) | Lớp 2: Group Fund (On-chain) |
|---|---|---|
| **Nơi lưu trữ** | MongoDB (Backend) | Smart Contract (Blockchain) |
| **Tốc độ** | Tức thì (< 100ms) | 5–15 giây (block time) |
| **Chi phí** | Miễn phí | Tốn Gas (người dùng trả) |
| **Tính riêng tư** | Được bảo vệ | Công khai trên chain |
| **Xác thực** | JWT + ECDSA (off-chain) | EIP-712 Multi-sig (on-chain) |
| **Dùng cho** | Nạp/rút/chuyển cá nhân | Quỹ nhóm, quản lý hạn mức |

---

## 3. Repository Structure

```text
BUDGET_MANAGER_APP/
│
├── backend/                        # Module Backend (Python/FastAPI)
├── frontend/                       # Module Frontend (Vanilla JS)
├── blockchain/                     # Module Blockchain (Hardhat)
│   ├── contracts/                  # Mã nguồn Smart Contract (Solidity)
│   │   ├── VaultFactory.sol        # Nhà máy tạo quỹ (EIP-1167 Clones)
│   │   ├── SharedVault.sol         # Hợp đồng quỹ nhóm phân quyền mới (EIP-712)
│   │   └── ExpenseManager.sol      # Quản lý hạn mức chi tiêu (Registry Pattern)
│   ├── scripts/
│   │   └── deploy.js               # Script deploy 3 bước lên testnet
│   ├── test/
│   │   ├── Fund.test.js            # Bộ kiểm thử cho Factory & SharedVault
│   │   └── ExpenseManager.test.js  # Bộ kiểm thử cho ExpenseManager (Todo)
│   ├── hardhat.config.js           # Cấu hình môi trường Hardhat
│   └── package.json                # Khai báo dependencies Node.js
│
├── READ_3.md                       # (Tài liệu này) Tổng hợp toàn bộ kiến trúc
└── .env                            # ⚠️ Biến môi trường (KHÔNG commit lên Git)
```

---

## 4. Module: Backend (FastAPI)

Backend đóng vai trò là "bộ não" (Brain Layer) của hệ thống — xử lý toàn bộ logic nghiệp vụ off-chain, làm trung gian an toàn giữa người dùng cuối và blockchain.
- Xác thực định danh qua chữ ký MetaMask (ECDSA, không mật khẩu).
- Quản lý số dư App Wallet của người dùng trong MongoDB.
- Ký và gửi giao dịch on-chain từ Treasury Wallet.
- Lưu trữ chữ ký EIP-712 off-chain từ các admin quỹ.
- Phát hiện sự kiện on-chain (Event Listener Worker) và đồng bộ với MongoDB qua các Events như `FundCreated`, `WithdrawExecuted`, `CategoryLimitUpdated`.

---

## 5. Module: Frontend (Vanilla JS)

Frontend là giao diện duy nhất người dùng tương tác, được xây dựng bằng **Vanilla JS thuần** để tối ưu hiệu năng.

### Luồng xác thực (Passwordless Authentication)
1. User click "Connect MetaMask" -> Frontend gọi GET `/members/nonce?address=0x...`
2. Backend trả về nonce ngẫu nhiên.
3. Frontend gọi MetaMask: `eth_sign(nonce)` (miễn phí gas).
4. Nhận chữ ký, gọi POST `/members/login { address, signature }`.
5. Backend dùng `ecrecover()` xác minh, trả về JWT Token.

---

## 6. Module: Blockchain (Hardhat + Solidity)

### 6.1 Tổng quan kiến trúc Smart Contract
Hệ thống cấu thành từ **3 Smart Contract** cốt lõi, tối ưu phí Gas qua mô hình Web2.5 Hybrid:
1. **`VaultFactory.sol`**: "Nhà máy" tạo quỹ bằng mô hình EIP-1167 (Minimal Proxy). Giảm 90% phí Gas khởi tạo.
2. **`SharedVault.sol`**: "Két sắt nhóm" thay thế FundVault cũ. Quản lý tiền, xác thực chữ ký EIP-712 đa chữ ký (Multi-sig) để duyệt giao dịch.
3. **`ExpenseManager.sol`**: Quản lý hạn mức chi tiêu theo danh mục. Hoạt động theo mô hình Registry (1 hợp đồng phục vụ nhiều vault).

### 6.2 Phân quyền Người dùng (Roles & Permissions)

| Vai trò (Role) | Vị trí | Quyền hạn và Đặc điểm Logic |
| :--- | :--- | :--- |
| **Admin System** | `VaultFactory` | - Nâng cấp phiên bản quỹ (`upgradeTemplate`). Không có quyền rút tiền user hay xóa quỹ. |
| **Fund Owner**| `SharedVault` | - Nắm quyền cao nhất 1 quỹ. Bắt buộc phải có chữ ký Owner khi "Đóng quỹ". Không ai được xóa Owner. |
| **Fund Member**| `SharedVault` | - Quyền ký tên (off-chain) thông qua rút tiền, quản trị thành viên dựa trên ngưỡng (`threshold`). |
| **Contributor**| `SharedVault` | - Khách vãng lai, chỉ được quyền Nạp tiền (`depositFor`, `receive`). |

### 6.3 Cơ chế thực thi: VaultFactory.sol
- Quản lý template quỹ.
- Hàm `createFund`: Kiểm tra data, lọc trùng lặp Member, thực thi `clone()`, gán owner và phát event `FundCreated` cho backend ghi dữ liệu.

### 6.4 Cơ chế thực thi: SharedVault.sol
- Hợp đồng sinh qua clone nên dùng `initialize()` thay vì `constructor`.
- **Rút tiền Đa chữ ký (`_verifySignatures`)**: Kiểm tra Replay Attack (Nonce), kiểm tra Threshold, xác thực EIP-712, kiểm tra quyền Member, và chặn trùng lặp qua thứ tự địa chỉ tăng dần.
- **Tích hợp ExpenseManager**: Hàm `executeWithdraw` gọi `expenseManager.validateTransaction(categoryId, amount)` trước khi rút tiền để đảm bảo không vi phạm hạn mức. Cấu trúc `WITHDRAW_TYPEHASH` bao gồm `categoryId` để chống giả mạo.
- **Đóng quỹ**: Sử dụng Soft-Delete (`state = VaultState.Closed`). Quỹ rỗng mới được đóng. Bắt buộc có chữ ký Owner.

### 6.5 Cơ chế thực thi: ExpenseManager.sol
- **Registry Pattern**: Sử dụng cấu trúc `mapping(address vault => mapping(uint256 categoryId => CategoryLimit))` để cách ly dữ liệu giữa các Vault.
- **Access Control**: Áp dụng modifier `onlyRegisteredVault` kết nối với `VaultFactory.isFundFromFactory()` nhằm bảo vệ data, ngăn EOA ngoài tự do thay đổi thông số.
- Các API chính: `setCategoryLimit` (chỉ > 0), `deactivateCategory`, `validateTransaction` (được gọi từ SharedVault) và `getCategoryInfo` (public view).

### 6.6 Luồng Multi-sig EIP-712
1. **Khởi tạo đề xuất (Off-chain, miễn phí gas)**: Lưu lên Backend.
2. **Ký xác nhận (Off-chain, miễn phí gas)**: Các Member ký data EIP-712 bằng MetaMask. Chữ ký lưu tại Backend.
3. **Thực thi (On-chain, tốn gas 1 lần)**: Gọi `SharedVault.executeWithdraw([sig1, sig2...])` khi gom đủ số lượng chữ ký.

---

## 7. Environment & Configuration

### Yêu cầu hệ thống

| Thành phần | Phiên bản tối thiểu | Khuyến nghị |
|---|---|---|
| Python | 3.8+ | 3.10 / 3.11 |
| Node.js | 18+ (LTS) | 20 LTS (không hỗ trợ v25.x cho Hardhat) |
| MongoDB | 5.0+ | 7.0 |
| Trình duyệt | Chrome/Brave/Edge | Chrome + MetaMask extension |

---

## 8. Development Setup — Getting Started

### Bước 1: Clone và cài đặt

```bash
git clone <repository-url>
cd BUDGET_MANAGER_APP
```

### Bước 2: Cài đặt Backend

```bash
python -m venv venv
source venv/bin/activate # (macOS/Linux) hoặc venv\Scripts\activate (Windows)
pip install -r requirements.txt
cp .env.example .env     # Cấu hình lại .env sau chép
```

### Bước 3: Cài đặt Blockchain

```bash
cd blockchain
npm install
```

### Bước 4: Chạy môi trường Development (Cần 3-4 Terminal)

```bash
# Terminal 1 — Backend API
uvicorn backend.app:app --reload --port 8000

# Terminal 2 — Blockchain local node
cd blockchain
npx hardhat node

# Terminal 3 — Deploy Smart Contract (3 Bước tuần tự)
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
# → Copy VAULT_TEMPLATE_ADDRESS, VAULT_FACTORY_ADDRESS, EXPENSE_MANAGER_ADDRESS vào file .env Backend

# Terminal 4 (tùy chọn) — Frontend static server
python -m http.server -d frontend 5500
```

---

## 9. Git Workflow & Contribution Guidelines

### Các file KHÔNG commit
```text
.env                        ← Chứa private key và secrets
venv/ hoặc .venv/           ← Môi trường ảo Python
blockchain/node_modules/    ← Dependencies Node.js
blockchain/artifacts/       ← Code đã biên dịch
blockchain/cache/           ← Cache của Hardhat
__pycache__/                ← Bytecode Python
```

### Quy tắc commit message
- `feat(...)`: Tính năng mới
- `fix(...)`: Vá lỗi
- `docs(...)`: Cập nhật tài liệu
- `test(...)`: Bổ sung kiểm thử
- `refactor(...)`: Tái cấu trúc code

---

## 10. Roadmap & Status

### ✅ Đã hoàn thành
- [x] Thiết kế kiến trúc Web2.5 Hybrid.
- [x] Backend FastAPI: Auth, Member API, Budget API.
- [x] Frontend: MetaMask integration.
- [x] Smart Contract `VaultFactory.sol` và `SharedVault.sol` (EIP-1167, EIP-712).
- [x] Sửa lỗi State trong `SharedVault` và Tích hợp `ExpenseManager`.
- [x] `ExpenseManager.sol`: Access Control (`onlyRegisteredVault`), `limit > 0` validation.
- [x] Cập nhật Script deploy 3 bước (`deploy.js`).

### 📋 Kế hoạch tiếp theo
- [ ] Viết bộ Unit Test `test/ExpenseManager.test.js` (25 Test cases như đã phân tích).
- [ ] Deploy lên Sepolia Testnet (cập nhật `.env`).
- [ ] Tích hợp Backend ↔ Smart Contract cho luồng giải ngân qua `ExpenseManager`.
