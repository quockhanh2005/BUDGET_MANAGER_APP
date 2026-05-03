/* ========================================
   Cấu hình & Trạng thái toàn cục
   ======================================== */

// ========== Cấu hình ==========
const API_BASE_URL = 'http://localhost:8000';

// Blockchain Configurations - Đã cập nhật từ .env
const VAULT_FACTORY_ADDRESS = '0x98664846FF5C23E71877528f5cd468cB9CA518Ef';
const VAULT_TEMPLATE_ADDRESS = '0xb56bCf8Ca814910b68638E572cd1fbC9dCE77ee0';
const BLOCKCHAIN_NETWORK_ID = '0xaa36a7'; // Sepolia (11155111 in hex)
const SIGN_MESSAGE_PREFIX = 'Budget Manager - Xác minh danh tính cho địa chỉ ví: ';

// ========== Trạng thái ==========
let currentStep = 1;
let connectedAddress = null;
let connectedChainId = null;
let currentBudgetId = null;
let currentMemberProfile = null;
let allSystemMembers = []; // Cache danh sách thành viên hệ thống
let balanceRefreshInterval = null; // Quản lý vòng lặp cập nhật số dư
let isBlockListenerActive = false; // Tránh đăng ký nhiều listener block
let isBalanceHidden = false;
let expectedBalanceChanges = []; // Theo dõi các thay đổi số dư đã biết từ app

// ========== Mock Data ==========
const MOCK_BUDGETS = [];
const MOCK_MAIN_TRANSACTIONS = [];
