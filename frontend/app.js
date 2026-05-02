/* ========================================
   Quản lý ngân sách - Tích hợp MetaMask
   Frontend JavaScript
   ======================================== */

// ========== Cấu hình ==========
const API_BASE_URL = 'http://localhost:8000';

// Blockchain Configurations
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

// ========== Mock Data cho Budget ==========
const MOCK_BUDGETS = [];

// ========== Mock Data cho Giao dịch chính ==========
const MOCK_MAIN_TRANSACTIONS = [];

// ========== Khởi tạo ==========
document.addEventListener('DOMContentLoaded', async () => {
    checkMetaMaskInstalled();
    listenForAccountChanges();

    // Thử tự động kết nối nếu đã có quyền truy cập
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                console.log('Found existing connection:', accounts[0]);
                connectedAddress = accounts[0];
                connectedChainId = await window.ethereum.request({ method: 'eth_chainId' });
                updateWalletUI();
                handleContinue(); // Tự động kiểm tra và vào dashboard
            }
        } catch (err) {
            console.error('Error auto-connecting:', err);
        }
    }

    // Thêm listener cho loại quỹ "Khác"
    const budgetTypeSelect = document.getElementById('create-budget-type');
    const budgetTypeOtherContainer = document.getElementById('budget-type-other-container');

    if (budgetTypeSelect && budgetTypeOtherContainer) {
        budgetTypeSelect.addEventListener('change', (e) => {
            console.log('Budget type changed to:', e.target.value);
            if (e.target.value === 'Khác') {
                budgetTypeOtherContainer.classList.remove('hidden');
                document.getElementById('budget-type-other').focus();
            } else {
                budgetTypeOtherContainer.classList.add('hidden');
            }
        });
    }

    // Thêm listener kiểm tra địa chỉ ví khi nhập (cho Modal Thêm thành viên)
    const newMemberAddressInput = document.getElementById('new-member-address');
    if (newMemberAddressInput) {
        newMemberAddressInput.addEventListener('input', async (e) => {
            const address = e.target.value.trim();
            const statusEl = document.getElementById('address-check-status');
            if (!statusEl) return;

            if (address.length === 42 && address.startsWith('0x')) {
                statusEl.textContent = '🔍 Đang kiểm tra người dùng...';
                statusEl.style.color = 'var(--text-secondary)';
                try {
                    const response = await fetch(`${API_BASE_URL}/members/?address=${address}`);
                    if (response.ok) {
                        const data = await response.json();
                        statusEl.textContent = `Tìm thấy: ${data.name}`;
                        statusEl.style.color = '#10b981';
                    } else {
                        statusEl.textContent = 'Người dùng chưa đăng ký hệ thống';
                        statusEl.style.color = '#f59e0b';
                    }
                } catch (err) {
                    statusEl.textContent = '';
                }
            } else {
                statusEl.textContent = '';
            }
        });
    }
});


// ========== Tiện ích MetaMask ==========

function checkMetaMaskInstalled() {
    if (typeof window.ethereum === 'undefined') {
        showToast('error', 'MetaMask chưa được cài đặt! Vui lòng cài đặt MetaMask extension để tiếp tục.');
        const btn = document.getElementById('btn-connect');
        btn.textContent = 'Cài đặt MetaMask';
        btn.onclick = () => window.open('https://metamask.io/download/', '_blank');
    }
}

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        showToast('error', 'Vui lòng cài đặt MetaMask trước!');
        return;
    }

    const btn = document.getElementById('btn-connect');
    btn.disabled = true;
    btn.innerHTML = `
        <div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div>
        Đang kết nối...
    `;

    try {
        // Yêu cầu quyền truy cập tài khoản
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (accounts.length === 0) {
            throw new Error('Không tìm thấy tài khoản nào');
        }

        connectedAddress = accounts[0];

        // Lấy chain ID
        connectedChainId = await window.ethereum.request({
            method: 'eth_chainId'
        });

        // Cập nhật giao diện
        updateWalletUI();
        showToast('success', 'Kết nối ví thành công!');

        // Tự động kiểm tra tài khoản
        handleContinue();


    } catch (error) {
        if (error.code === 4001) {
            showToast('error', 'Bạn đã từ chối kết nối ví.');
        } else {
            showToast('error', `Lỗi kết nối: ${error.message}`);
        }
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
            Kết nối MetaMask
        `;
    }
}

function updateWalletUI() {
    // Cập nhật trạng thái
    const statusEl = document.getElementById('wallet-status');
    statusEl.innerHTML = `
        <div class="status-dot connected"></div>
        <span>Đã kết nối</span>
    `;

    // Ẩn nút kết nối, hiển thị thẻ đã kết nối
    document.getElementById('btn-connect').classList.add('hidden');
    document.getElementById('wallet-connected').classList.remove('hidden');

    // Đặt địa chỉ ví
    document.getElementById('wallet-address').textContent = connectedAddress;

    // Đặt tên mạng
    const networkName = getNetworkName(connectedChainId);
    document.getElementById('network-name').textContent = networkName;

    // Cập nhật hiển thị ví trong form
    document.getElementById('wallet-display').value = connectedAddress;

    // Bắt đầu vòng lặp cập nhật số dư liên tục
    startBalanceAutoRefresh();
}

function getNetworkName(chainId) {
    const networks = {
        '0x1': 'Ethereum Mainnet',
        '0x5': 'Goerli Testnet',
        '0xaa36a7': 'Sepolia Testnet',
        '0x89': 'Polygon Mainnet',
        '0x13881': 'Mumbai Testnet',
        '0xa86a': 'Avalanche C-Chain',
        '0xa4b1': 'Arbitrum One',
        '0xa': 'Optimism',
        '0x38': 'BNB Smart Chain',
        '0x539': 'Localhost (Hardhat)',
        '0x7a69': 'Hardhat Network',
    };
    return networks[chainId] || `Chain ID: ${parseInt(chainId, 16)}`;
}

function shortenAddress(address) {
    if (!address) return '';
    if (address.length < 10) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function listenForAccountChanges() {
    if (typeof window.ethereum === 'undefined') return;

    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // Người dùng ngắt kết nối
            connectedAddress = null;
            resetToStep1();
            showToast('info', 'Ví đã bị ngắt kết nối.');
        } else {
            connectedAddress = accounts[0];
            updateWalletUI();
            showToast('info', 'Đã chuyển sang tài khoản mới.');
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        connectedChainId = chainId;
        document.getElementById('network-name').textContent = getNetworkName(chainId);
        showToast('info', `Đã chuyển mạng: ${getNetworkName(chainId)}`);
        
        // Làm mới dữ liệu khi chuyển mạng
        refreshBalances();

        // Nếu không phải Sepolia, cảnh báo người dùng
        if (chainId !== BLOCKCHAIN_NETWORK_ID) {
            showToast('error', 'Cảnh báo: Bạn đã rời khỏi mạng Sepolia!');
        }
    });
}

/**
 * Hàm làm mới toàn bộ số dư hiển thị trên giao diện
 */
async function refreshBalances() {
    if (!connectedAddress) return;

    console.log('--- Refreshing balances ---');
    
    // 1. Luôn cập nhật số dư ví cá nhân (nếu đang ở Dashboard chính)
    const walletBalanceEl = document.getElementById('dashboard-balance');
    if (walletBalanceEl && (currentStep === 'dashboard' || currentStep === 'budget-management')) {
        const balanceEth = await getOnChainBalance(connectedAddress);
        // Cập nhật trực tiếp không cần hiệu ứng nhảy số nếu là update ngầm để tránh rối mắt
        walletBalanceEl.textContent = parseFloat(balanceEth).toFixed(4);
    }

    // 2. Cập nhật số dư các quỹ nếu đang ở màn hình Quản lý Quỹ
    if (currentStep === 'budget-management') {
        renderBudgetManagement(); 
    }

    // 3. Cập nhật số dư quỹ cụ thể nếu đang xem chi tiết quỹ
    if (currentStep === 'budget-dashboard' && currentBudgetId) {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (budget) {
            // Lấy số dư thực tế
            if (budget.vault_address) {
                const onChainBal = await getOnChainBalance(budget.vault_address);
                document.getElementById('budget-balance').textContent = parseFloat(onChainBal).toFixed(4);
            }
        }
    }
}

/**
 * Khởi động cơ chế tự động làm mới
 */
function startBalanceAutoRefresh() {
    // Xóa interval cũ nếu có
    if (balanceRefreshInterval) clearInterval(balanceRefreshInterval);

    // Cứ 15 giây cập nhật một lần (Polling)
    balanceRefreshInterval = setInterval(refreshBalances, 15000);

    // Ngoài ra, lắng nghe sự kiện Block mới từ Ethers (nếu muốn cập nhật nhanh hơn)
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        provider.on('block', (blockNumber) => {
            console.log('New block mined:', blockNumber);
            refreshBalances();
        });
    } catch (e) {
        console.warn('Không thể thiết lập Block Listener:', e);
    }
}

/**
 * Đảm bảo người dùng đang ở đúng mạng Sepolia
 */
async function ensureSepoliaNetwork() {
    if (!window.ethereum) return false;

    try {
        // Yêu cầu chuyển mạng
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BLOCKCHAIN_NETWORK_ID }],
        });
        return true;
    } catch (switchError) {
        // Lỗi 4902: Mạng chưa được thêm vào MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: BLOCKCHAIN_NETWORK_ID,
                        chainName: 'Sepolia Test Network',
                        nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                        blockExplorerUrls: ['https://sepolia.etherscan.io'],
                    }],
                });
                return true;
            } catch (addError) {
                showToast('error', 'Không thể thêm mạng Sepolia vào MetaMask.');
                return false;
            }
        }
        showToast('error', 'Vui lòng chuyển sang mạng Sepolia trong MetaMask.');
        return false;
    }
}

// ========== Điều hướng các bước ==========
function goToStep(step) {
    console.log('Going to step:', step);
    const container = document.querySelector('.container');

    // Nếu là dashboard hoặc budget-dashboard hoặc budget-management, ẩn toàn bộ thanh tiến trình và mở rộng khung
    if (step === 'dashboard' || step === 'budget-dashboard' || step === 'budget-management') {
        container.classList.add('wide');
        document.querySelector('.steps').style.display = 'none';
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        let targetId;
        if (step === 'dashboard') targetId = 'step-dashboard';
        else if (step === 'budget-dashboard') targetId = 'step-budget-dashboard';
        else targetId = 'step-budget-management';

        document.getElementById(targetId).classList.add('active');
        currentStep = step;
        return;
    }

    // Thu nhỏ khung lại cho các bước khác
    container.classList.remove('wide');
    document.querySelector('.steps').style.display = 'flex';


    // Cập nhật các vòng tròn chỉ báo
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step-indicator-${i}`);
        if (i < step) {
            indicator.classList.add('completed');
            indicator.classList.remove('active');
        } else if (i === step) {
            indicator.classList.add('active');
            indicator.classList.remove('completed');
        } else {
            indicator.classList.remove('active', 'completed');
        }

        // Cập nhật đường kẻ
        const line = document.getElementById(`step-line-${i}`);
        if (line) {
            if (i < step) {
                line.classList.add('active');
            } else {
                line.classList.remove('active');
            }
        }
    }

    // Hiện/ẩn nội dung
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    const targetContent = document.getElementById(`step-${step}`);
    if (targetContent) targetContent.classList.add('active');

    currentStep = step;
}

async function handleContinue() {
    console.log('HandleContinue triggered for address:', connectedAddress);

    if (!connectedAddress) {
        showToast('error', 'Vui lòng kết nối ví trước!');
        return;
    }

    showLoading('Đang xác thực tài khoản...');

    try {
        const url = `${API_BASE_URL}/members/?address=${connectedAddress}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (response.ok) {
            const member = await response.json();
            currentMemberProfile = member;
            hideLoading();
            renderDashboard(member);
            showToast('success', `Chào mừng quay lại, ${member.name}!`);
        } else if (response.status === 404) {
            hideLoading();
            goToStep(2);
        } else {
            throw new Error('Lỗi máy chủ khi kiểm tra thành viên');
        }
    } catch (error) {
        hideLoading();
        console.error('API Error:', error);
        showToast('error', 'Lỗi: ' + error.message);
    }
}




function resetToStep1() {
    connectedAddress = null;
    connectedChainId = null;

    // Đặt lại giao diện ví
    const statusEl = document.getElementById('wallet-status');
    statusEl.innerHTML = `
        <div class="status-dot disconnected"></div>
        <span>Chưa kết nối</span>
    `;

    document.getElementById('btn-connect').classList.remove('hidden');
    document.getElementById('btn-connect').disabled = false;
    document.getElementById('btn-connect').innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        Kết nối MetaMask
    `;
    document.getElementById('wallet-connected').classList.add('hidden');

    goToStep(1);
}

// ========== Kiểm tra Form ==========
function validateForm() {
    const memberId = document.getElementById('member_id').value.trim();
    const name = document.getElementById('name').value.trim();
    const age = document.getElementById('age').value;

    if (!memberId) {
        showToast('error', 'Vui lòng nhập mã định danh (CCCD).');
        document.getElementById('member_id').focus();
        return false;
    }

    if (!name) {
        showToast('error', 'Vui lòng nhập họ và tên.');
        document.getElementById('name').focus();
        return false;
    }

    if (!age || parseInt(age) < 1 || parseInt(age) > 150) {
        showToast('error', 'Vui lòng nhập tuổi hợp lệ (1-150).');
        document.getElementById('age').focus();
        return false;
    }

    return true;
}

// ========== Xem lại ==========
function populateReview() {
    document.getElementById('review-member-id').textContent = document.getElementById('member_id').value.trim();
    document.getElementById('review-name').textContent = document.getElementById('name').value.trim();
    document.getElementById('review-age').textContent = document.getElementById('age').value;
    document.getElementById('review-email').textContent = document.getElementById('email').value.trim() || '(không có)';
    document.getElementById('review-address').textContent = connectedAddress;
}

// ========== Ký & Gửi ==========
async function signAndSubmit() {
    if (!connectedAddress) {
        showToast('error', 'Ví đã bị ngắt kết nối. Vui lòng kết nối lại.');
        resetToStep1();
        return;
    }

    const btnSign = document.getElementById('btn-sign');
    btnSign.disabled = true;

    showLoading('Đang chờ chữ ký từ MetaMask...');

    try {
        // Tạo tin nhắn để ký
        const message = SIGN_MESSAGE_PREFIX + connectedAddress;

        // Yêu cầu chữ ký từ MetaMask (personal_sign)
        const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [message, connectedAddress],
        });

        updateLoadingText('Đang gửi dữ liệu lên server...');

        // Chuẩn bị dữ liệu
        const memberData = {
            member_id: document.getElementById('member_id').value.trim(),
            name: document.getElementById('name').value.trim(),
            age: parseInt(document.getElementById('age').value),
            member_address: connectedAddress,
            email: document.getElementById('email').value.trim() || null,
            signature: signature,
            message: message,
        };

        // Gửi tới backend API
        const response = await fetch(`${API_BASE_URL}/members/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(memberData),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Lỗi từ server');
        }

        hideLoading();

        // Hiển thị thành công
        showSuccessState(result);
        showToast('success', 'Đăng ký thành viên thành công!');


    } catch (error) {
        hideLoading();
        btnSign.disabled = false;

        if (error.code === 4001) {
            showToast('error', 'Bạn đã từ chối ký message.');
        } else {
            showToast('error', `Lỗi: ${error.message}`);
        }
    }
}

async function renderDashboard(member) {
    console.log('Rendering dashboard for:', member.name);

    const container = document.querySelector('.container');
    container.classList.add('wide');

    // Ẩn chỉ báo bước
    document.querySelector('.steps').style.display = 'none';

    // Cập nhật thông tin cơ bản
    document.getElementById('dashboard-user-name').textContent = `Chào mừng, ${member.name}`;
    document.getElementById('dashboard-member-id').textContent = member.member_id;
    document.getElementById('dashboard-email').textContent = member.email || 'N/A';
    document.getElementById('dashboard-address').textContent = member.member_address;

    // Định dạng ngày tham gia
    const joinDate = member.created_at ? new Date(member.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');
    document.getElementById('dashboard-created-at').textContent = joinDate;

    // Lấy số dư ví từ MetaMask
    if (typeof window.ethereum !== 'undefined' && connectedAddress) {
        try {
            const balanceEth = await getOnChainBalance(connectedAddress);
            
            // Hiệu ứng số nhảy cho balance
            animateNumber('dashboard-balance', 0, parseFloat(balanceEth), 1000);

            // Cập nhật trạng thái mạng
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            const networkName = getNetworkName(chainId);
            document.getElementById('dashboard-wallet-status').textContent = `Đang kết nối: ${networkName}`;
        } catch (err) {
            console.error('Error fetching balance:', err);
            document.getElementById('dashboard-balance').textContent = '0.00';
        }
    }

    // Hiện dashboard
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById('step-dashboard').classList.add('active');
    // Render lịch sử giao dịch chính
    renderMainTransactions();
    // Render danh sách quỹ tóm tắt
    renderBudgets();
}

async function renderMainTransactions() {
    const listEl = document.getElementById('main-transaction-list');
    if (!listEl) return;

    // Lấy dữ liệu từ backend hoặc từ log tạm thời
    const transactions = await fetchMainTransactions();

    if (transactions.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Chưa có giao dịch nào</p></div>';
        return;
    }

    listEl.innerHTML = '';
    transactions.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'transaction-item';
        
        // Xác định icon dựa trên loại giao dịch
        const isExpense = tx.type === 'expense' || tx.amount < 0;
        
        div.innerHTML = `
            <div class="tx-info">
                <span class="tx-title">${tx.title}</span>
                <span class="tx-date">${new Date(tx.date).toLocaleString('vi-VN')}</span>
                ${tx.hash ? `<a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" class="tx-hash-link">${shortenAddress(tx.hash)}</a>` : ''}
            </div>
            <div class="tx-amount-group" style="text-align: right;">
                <div class="tx-amount ${tx.type}">
                    ${tx.amount !== 0 ? (tx.amount > 0 ? '+' : '') + tx.amount.toFixed(4) + ' ETH' : 'Smart Contract'}
                </div>
                ${tx.gas_fee ? `<div class="tx-gas-fee" style="font-size: 11px; opacity: 0.6;">Gas: ${tx.gas_fee.toFixed(6)} ETH</div>` : ''}
            </div>
        `;
        listEl.appendChild(div);
    });
}

/**
 * Lấy lịch sử giao dịch từ hệ thống
 */
async function fetchMainTransactions() {
    if (!connectedAddress) return [];
    
    try {
        const response = await fetch(`${API_BASE_URL}/wallet/history?address=${connectedAddress}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.error('Error fetching history from backend:', err);
    }
    
    // Fallback sang localStorage nếu backend lỗi
    const localLogs = JSON.parse(localStorage.getItem(`tx_logs_${connectedAddress}`) || '[]');
    return localLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * Hàm ghi log giao dịch mới
 */
async function logTransaction(txData) {
    if (!connectedAddress) return;
    
    const fullTxData = {
        ...txData,
        wallet_address: connectedAddress
    };

    // 1. Lưu vào localStorage để hiển thị ngay lập tức (Optimistic UI)
    const logs = JSON.parse(localStorage.getItem(`tx_logs_${connectedAddress}`) || '[]');
    logs.push(fullTxData);
    localStorage.setItem(`tx_logs_${connectedAddress}`, JSON.stringify(logs));
    renderMainTransactions();

    // 2. Gửi lên Backend để lưu trữ lâu dài
    try {
        await fetch(`${API_BASE_URL}/wallet/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullTxData)
        });
    } catch (err) {
        console.error('Error saving transaction to backend:', err);
    }
}

async function renderBudgets() {
    const listEl = document.getElementById('budgets-list');
    if (!listEl) return;

    // Lấy dữ liệu thật từ API
    const budgetList = await fetchBudgets();

    if (budgetList.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Bạn chưa tham gia quỹ nào</p></div>';
        return;
    }

    listEl.innerHTML = '';
    for (const budget of budgetList) {
        const item = document.createElement('div');
        item.className = 'budget-item';
        item.onclick = () => openBudgetDashboard(budget.id);

        // Lấy số dư thực tế từ blockchain nếu có địa chỉ vault
        let displayBalance = budget.balance;
        if (budget.vault_address) {
            displayBalance = await getOnChainBalance(budget.vault_address);
        }

        item.innerHTML = `
            <div class="budget-info">
                <span class="budget-name">${budget.name}</span>
                <span class="budget-meta">${budget.type} • ${budget.members.length} thành viên</span>
            </div>
            <div class="budget-item-balance">
                <span class="budget-item-amount">${parseFloat(displayBalance).toFixed(4)}</span>
                <span class="budget-item-currency">ETH</span>
            </div>
        `;
        listEl.appendChild(item);
    }
}

async function openBudgetDashboard(budgetId) {
    currentBudgetId = budgetId;
    showLoading('Đang tải dữ liệu quỹ...');

    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === budgetId);

        if (!budget) {
            hideLoading();
            showToast('error', 'Không tìm thấy thông tin quỹ');
            return;
        }

        await renderBudgetDashboard(budget);
        goToStep('budget-dashboard');
        hideLoading();
    } catch (err) {
        hideLoading();
        showToast('error', 'Lỗi khi tải dữ liệu quỹ: ' + err.message);
        console.error('Detailed Error in openBudgetDashboard:', err);
    }
}

async function renderBudgetDashboard(budget) {
    console.log('Rendering Dashboard for budget:', budget);
    
    // Đảm bảo các mảng tồn tại
    budget.members = budget.members || [];
    budget.rules = budget.rules || [];
    budget.transactions = budget.transactions || [];

    // Cập nhật thông tin cơ bản
    const titleEl = document.getElementById('budget-title');
    if (titleEl) titleEl.textContent = budget.name || 'Quỹ không tên';
    
    const idEl = document.getElementById('budget-id-display');
    if (idEl) idEl.textContent = budget.id || '---';
    
    const descEl = document.getElementById('budget-description');
    if (descEl) descEl.textContent = budget.description || '';
    
    const statusEl = document.getElementById('budget-status');
    if (statusEl) statusEl.textContent = 'Hoạt động';
    
    const typeEl = document.getElementById('budget-type');
    if (typeEl) typeEl.textContent = budget.type || 'Khác';
    
    const vaultEl = document.getElementById('budget-vault-address');
    if (vaultEl) vaultEl.textContent = budget.vault_address || 'N/A';

    // Lấy số dư thực tế từ blockchain nếu có địa chỉ vault
    let displayBalance = budget.balance || 0;
    if (budget.vault_address && budget.vault_address !== 'n/a') {
        try {
            const onChainBal = await getOnChainBalance(budget.vault_address);
            displayBalance = parseFloat(onChainBal);
        } catch (e) {
            console.warn('Could not fetch on-chain balance:', e);
        }
    }

    // Hiệu ứng số nhảy cho balance
    const balanceEl = document.getElementById('budget-balance');
    if (balanceEl) {
        animateNumber('budget-balance', 0, displayBalance, 800);
    }

    // Render thành viên
    const membersList = document.getElementById('budget-members-list');
    if (membersList) {
        const countEl = document.getElementById('budget-member-count');
        if (countEl) countEl.textContent = `${budget.members.length} thành viên`;
        
        membersList.innerHTML = '';
        budget.members.forEach(member => {
            const div = document.createElement('div');
            div.className = 'member-item';

            const isMe = member.address && connectedAddress && member.address.toLowerCase() === connectedAddress.toLowerCase();
            const displayName = isMe ? (currentMemberProfile ? currentMemberProfile.name : member.name) : member.name;

            div.innerHTML = `
                <div class="member-avatar">${member.avatar || 'U'}</div>
                <div class="member-details">
                    <span class="member-name">${displayName || 'Thành viên'} ${isMe ? '<small>(Bạn)</small>' : ''}</span>
                    <span class="member-role">${member.role === 'owner' ? 'Chủ sở hữu' : (member.role || 'member')} — <small>${shortenAddress(member.address || '')}</small></span>
                </div>
                ${!isMe ? `
                <button class="btn-remove-member" onclick="handleRemoveMember('${member.address}')" title="Xóa khỏi quỹ" style="background: none; border: none; color: #ff4d4d; opacity: 0.5; cursor: pointer; padding: 5px; transition: 0.3s;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>` : ''}
            `;
            membersList.appendChild(div);
        });
    }

    // Render quy tắc
    const rulesList = document.getElementById('budget-rules-list');
    if (rulesList) {
        rulesList.innerHTML = '';
        budget.rules.forEach(rule => {
            const div = document.createElement('div');
            div.className = 'rule-item';
            div.innerHTML = `
                <span class="rule-name">${rule.name || ''}</span>
                <span class="rule-desc">${rule.desc || ''}</span>
            `;
            rulesList.appendChild(div);
        });
    }

    // Render giao dịch
    const historyList = document.getElementById('budget-history-list');
    if (historyList) {
        if (budget.transactions.length === 0) {
            historyList.innerHTML = '<div class="empty-state"><p>Chưa có giao dịch nào</p></div>';
        } else {
            historyList.innerHTML = '';
            budget.transactions.forEach(tx => {
                const div = document.createElement('div');
                div.className = 'history-item';
                div.innerHTML = `
                    <div class="tx-info">
                        <span class="tx-title">${tx.title || 'Giao dịch'}</span>
                        <span class="tx-date">${tx.date || ''}</span>
                    </div>
                    <div class="tx-amount ${tx.type || ''}">${tx.type === 'deposit' ? '+' : '-'}${tx.amount || 0} ETH</div>
                `;
                historyList.appendChild(div);
            });
        }
    }
    
    // Tải và hiển thị các yêu cầu rút tiền và thành viên đang chờ duyệt
    fetchAndRenderPendingProposals();
}

function animateNumber(id, start, end, duration) {
    const obj = document.getElementById(id);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = (progress * (end - start) + start).toFixed(4);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function showSuccessState(member, isExisting = false) {
    currentMemberProfile = member;
    renderDashboard(member);
}



// ========== Đặt lại ==========
function resetForm() {
    // Xóa dữ liệu form
    document.getElementById('member-form').reset();

    const container = document.querySelector('.container');
    container.classList.remove('wide');

    // Hiển thị chỉ báo bước
    document.querySelector('.steps').style.display = 'flex';

    // Đặt lại chỉ báo bước
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step-indicator-${i}`);
        indicator.classList.remove('active', 'completed');
    }
    document.getElementById('step-indicator-1').classList.add('active');

    for (let i = 1; i <= 2; i++) {
        document.getElementById(`step-line-${i}`).classList.remove('active');
    }

    // Hiển thị bước 1
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));

    // Nếu ví vẫn kết nối, hiển thị bước 1 với trạng thái đã kết nối
    if (connectedAddress) {
        document.getElementById('step-1').classList.add('active');
        updateWalletUI();
    } else {
        resetToStep1();
    }

    currentStep = 1;

    // Bật lại nút ký
    document.getElementById('btn-sign').disabled = false;
}

// ========== Hiệu ứng Tải ==========
function showLoading(text) {
    document.getElementById('loading-text').textContent = text || 'Đang xử lý...';
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function updateLoadingText(text) {
    document.getElementById('loading-text').textContent = text;
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// ========== Thông báo Toast ==========
function showToast(type, message) {
    const container = document.getElementById('toast-container');

    const icons = {
        error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
        info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="removeToast(this.parentElement)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
    `;

    container.appendChild(toast);

    // Tự động xóa sau 5 giây
    setTimeout(() => {
        removeToast(toast);
    }, 5000);
}

function removeToast(toast) {
    if (!toast || toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => {
        toast.remove();
    }, 300);
}
let isBalanceHidden = false;

function toggleBalanceVisibility() {
    const balanceEl = document.getElementById('dashboard-balance');
    const eyeIcon = document.getElementById('eye-icon');
    isBalanceHidden = !isBalanceHidden;

    if (isBalanceHidden) {
        balanceEl.classList.add('hidden-balance');
        // Đổi icon sang mắt gạch chéo (Eye Off)
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        showToast('info', 'Số dư đã được ẩn');
    } else {
        balanceEl.classList.remove('hidden-balance');
        // Đổi lại icon mắt bình thường
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
}

function goToBudgetManagement() {
    showLoading('Đang tải trung tâm quản lý quỹ...');
    setTimeout(() => {
        renderBudgetManagement();
        goToStep('budget-management');
        hideLoading();
    }, 500);
}

async function renderBudgetManagement() {
    const gridEl = document.getElementById('budget-feature-grid');
    if (!gridEl) return;

    // Lấy dữ liệu thật từ API
    const budgetList = await fetchBudgets();

    // Cập nhật thống kê
    document.getElementById('total-budgets-count').textContent = budgetList.length;
    const totalAmount = budgetList.reduce((sum, b) => sum + b.balance, 0);
    document.getElementById('total-budgeted-amount').textContent = totalAmount.toFixed(2);
    document.getElementById('most-active-budget').textContent = budgetList[0]?.name || '--';

    // Render lưới thẻ quỹ
    gridEl.innerHTML = '';
    if (budgetList.length === 0) {
        gridEl.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;"><p>Bạn chưa tham gia quỹ nào. Hãy tạo quỹ mới!</p></div>';
        return;
    }

    let totalOnChainBalance = 0;

    for (const budget of budgetList) {
        // Lấy số dư thực tế từ blockchain
        let displayBalance = budget.balance;
        if (budget.vault_address) {
            const onChainBal = await getOnChainBalance(budget.vault_address);
            displayBalance = parseFloat(onChainBal);
        }
        totalOnChainBalance += displayBalance;

        const card = document.createElement('div');
        card.className = 'dash-card budget-feature-card';
        card.style.position = 'relative';
        card.onclick = () => openBudgetDashboard(budget.id);

        card.innerHTML = `
            <button class="btn-delete-budget" onclick="event.stopPropagation(); handleDeleteBudgetById('${budget.id}')" title="Xóa quỹ" style="position: absolute; top: 10px; right: 10px; background: rgba(255,77,77,0.1); border: none; color: #ff4d4d; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; z-index: 5;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <div class="budget-card-top">
                <div class="budget-card-title">${budget.name}</div>
                <div class="type-badge" style="margin-right: 30px;">${budget.type}</div>
            </div>
            <div class="budget-card-balance">
                <span class="amount">${displayBalance.toFixed(4)}</span>
                <span class="currency">ETH</span>
            </div>
            <div class="budget-card-footer">
                <span class="members-count">${budget.members.length} thành viên</span>
                <div class="members-avatars">
                    ${budget.members.slice(0, 3).map(m => `<div class="mini-avatar">${m.avatar}</div>`).join('')}
                    ${budget.members.length > 3 ? `<div class="mini-avatar more">+${budget.members.length - 3}</div>` : ''}
                </div>
            </div>
        `;
        gridEl.appendChild(card);
    }

    // Cập nhật lại tổng số tiền dựa trên số dư thực tế đã quét
    document.getElementById('total-budgeted-amount').textContent = totalOnChainBalance.toFixed(4);
}

/**
 * Hàm tiện ích lấy số dư ETH từ Blockchain
 */
async function getOnChainBalance(address) {
    if (!window.ethereum || !address) return "0.00";
    try {
        const balanceWei = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [address, 'latest']
        });
        // Chuyển từ Wei (hex) sang ETH (float)
        return (parseInt(balanceWei, 16) / 1e18).toString();
    } catch (e) {
        console.error("Lỗi khi lấy số dư cho " + address, e);
        return "0.00";
    }
}
async function fetchBudgets() {
    if (!connectedAddress) return [];
    try {
        // Sử dụng endpoint /budgets/ để lấy danh sách quỹ mà ví này tham gia
        const response = await fetch(`${API_BASE_URL}/budgets/?address=${connectedAddress}`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (err) {
        console.error('Fetch Budgets Error:', err);
        return [];
    }
}

function openCreateBudgetModal() {
    document.getElementById('create-budget-modal').classList.remove('hidden');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

async function handleCreateBudget(event) {
    event.preventDefault();
    const name = document.getElementById('budget-name').value;
    const description = document.getElementById('budget-description').value;
    let type = document.getElementById('create-budget-type').value;

    // Nếu chọn "Khác", lấy giá trị từ ô nhập liệu tự chọn
    if (type === 'Khác') {
        const otherType = document.getElementById('budget-type-other').value.trim();
        if (otherType) {
            type = otherType;
        }
    }

    const budgetData = {
        name,
        description,
        type,
        members: [
            {
                name: currentMemberProfile ? currentMemberProfile.name : 'Quản trị viên',
                address: connectedAddress,
                role: 'Owner',
                avatar: currentMemberProfile ? currentMemberProfile.name.charAt(0).toUpperCase() : 'A'
            }
        ],
        rules: [],
        transactions: []
    };

    const result = await createBudget(budgetData);
    if (result) {
        closeModal('create-budget-modal');
        document.getElementById('create-budget-form').reset();
        document.getElementById('budget-type-other-container').classList.add('hidden');
        // Cập nhật lại danh sách quỹ nếu đang ở trang quản lý
        if (currentStep === 'budget-management') {
            renderBudgetManagement();
        }
    }
}

async function createBudget(budgetData) {
    if (!connectedAddress) {
        showToast('error', 'Vui lòng kết nối ví trước!');
        return;
    }

    showLoading('Đang kiểm tra mạng lưới...');

    try {
        // 0. Đảm bảo đúng mạng Sepolia
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) {
            hideLoading();
            return;
        }

        updateLoadingText('Đang khởi tạo giao dịch trên Blockchain...');

        // 1. Khởi tạo Ethers Provider và Signer
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // 2. Kết nối với Smart Contract Factory
        const factoryContract = new ethers.Contract(VAULT_FACTORY_ADDRESS, WALLET_FACTORY_ABI, signer);

        // 3. Gọi hàm tạo Vault trên Blockchain
        // owners: danh sách các địa chỉ sở hữu (mặc định là người tạo)
        // threshold: số lượng chữ ký cần thiết (mặc định là 1)
        const members = [connectedAddress];
        const threshold = 1;

        updateLoadingText('Đang chờ xác nhận giao dịch từ MetaMask...');
        const tx = await factoryContract.createFund(members, threshold);
        
        updateLoadingText('Đang chờ mạng lưới xác nhận (có thể mất 15-30s)...');
        const receipt = await tx.wait();

        let vaultAddress = null;
        for (const log of receipt.logs) {
            try {
                if (log.address.toLowerCase() !== VAULT_FACTORY_ADDRESS.toLowerCase()) continue;

                const parsedLog = factoryContract.interface.parseLog(log);
                if (parsedLog && parsedLog.name === 'FundCreated') {
                    vaultAddress = parsedLog.args.fundAddress || parsedLog.args[0];
                    break;
                }
            } catch (e) {
                // Skip
            }
        }

        if (!vaultAddress) {
            throw new Error('Đã tạo thành công nhưng không tìm thấy địa chỉ Vault trong log.');
        }

        console.log('Smart Vault deployed at:', vaultAddress);
        updateLoadingText('Lưu thông tin vào hệ thống...');

        // 5. Tính toán phí Gas đã dùng
        let gasFee = 0;
        try {
            const feeWei = receipt.gasUsed * receipt.gasPrice;
            gasFee = parseFloat(ethers.formatEther(feeWei));
        } catch (e) {
            console.error('Error calculating gas fee:', e);
        }

        // 6. Gửi dữ liệu kèm theo địa chỉ Vault và thông tin Transaction về Backend
        const response = await fetch(`${API_BASE_URL}/budgets/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...budgetData,
                creator_address: connectedAddress,
                vault_address: vaultAddress,
                tx_hash: receipt.hash,
                gas_fee: gasFee
            }),
        });

        const result = await response.json();
        if (!response.ok) {
            console.error('Validation Error Details:', result.detail);
            const errorMsg = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail);
            throw new Error(errorMsg || 'Lỗi từ server');
        }

        hideLoading();
        showToast('success', 'Tạo quỹ và Smart Vault thành công!');

        // Cập nhật lại lịch sử giao dịch trên UI
        renderMainTransactions();

        return result;
    } catch (error) {
        hideLoading();
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') {
            errorMsg = 'Bạn đã từ chối giao dịch trên MetaMask.';
        }
        showToast('error', 'Lỗi khi tạo quỹ: ' + errorMsg);
        console.error('Create Budget Error:', error);
    }
}

function openAddMemberModal() {
    document.getElementById('add-member-modal').classList.remove('hidden');
}

async function handleAddMember(event) {
    event.preventDefault();
    const address = document.getElementById('new-member-address').value.trim();
    const role = document.getElementById('new-member-role').value;

    if (!address.startsWith('0x') || address.length !== 42) {
        showToast('error', 'Địa chỉ ví không hợp lệ!');
        return;
    }

    showLoading('Đang chuẩn bị yêu cầu...');

    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        if (!budget) throw new Error('Không tìm thấy quỹ');

        // Nếu là Quỹ thường (không có Vault) hoặc người dùng muốn bypass (tùy logic hệ thống)
        if (!budget.vault_address) {
            const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/add-member-by-address`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, role })
            });
            if (response.ok) {
                showToast('success', 'Đã thêm thành viên thành công!');
                closeModal('add-member-modal');
                // Gọi lại hàm openBudgetDashboard để tải lại toàn bộ dữ liệu quỹ chuẩn xác
                openBudgetDashboard(currentBudgetId);
            } else {
                const err = await response.json();
                throw new Error(err.detail || 'Lỗi khi thêm thành viên');
            }
            return;
        }

        // --- GIAO THỨC MULTI-SIG (EIP-712) ---
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        // Giả sử giữ nguyên threshold hoặc tăng 1 nếu muốn
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        
        // TỰ ĐỘNG TÍNH THRESHOLD QUÁ BÁN: (Số lượng mới / 2) + 1
        const newTotalMembers = budget.members.length + 1;
        const newThreshold = Math.floor(newTotalMembers / 2) + 1;

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            AddMemberRequest: [
                { name: "newMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            newMember: address,
            newThreshold: BigInt(newThreshold),
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };

        updateLoadingText('Vui lòng ký yêu cầu thêm thành viên...');
        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang gửi đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget_id: currentBudgetId,
                type: "ADD_MEMBER",
                target_address: address,
                proposer_address: connectedAddress,
                nonce: nonce,
                deadline: deadline,
                signature: signature,
                new_threshold: newThreshold
            })
        });

        if (response.ok) {
            showToast('success', 'Đã tạo đề xuất thêm thành viên thành công!');
            closeModal('add-member-modal');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi tạo đề xuất');
        }

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

async function handleRemoveMember(targetAddress) {
    if (!confirm(`Bạn có chắc chắn muốn xóa thành viên ${targetAddress} khỏi quỹ?`)) return;

    showLoading('Đang chuẩn bị yêu cầu xóa...');

    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        if (!budget) throw new Error('Không tìm thấy quỹ');

        if (!budget.vault_address) {
            const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/members/${targetAddress}?operator_address=${connectedAddress}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                showToast('success', 'Đã xóa thành viên thành công!');
                renderBudgetDashboard(await response.json());
            } else {
                const err = await response.json();
                throw new Error(err.detail || 'Lỗi khi xóa thành viên');
            }
            return;
        }

        // --- GIAO THỨC MULTI-SIG (EIP-712) ---
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        const currentThreshold = await vaultContract.threshold();
        const memberCount = await vaultContract.activeMemberCount();
        
        // Nếu xóa xong mà memberCount <= threshold, phải giảm threshold
        let newThreshold = Number(currentThreshold);
        if (Number(memberCount) - 1 < newThreshold) {
            newThreshold = Math.max(1, Number(memberCount) - 1);
        }

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            RemoveMemberRequest: [
                { name: "oldMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            oldMember: targetAddress,
            newThreshold: BigInt(newThreshold),
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };

        updateLoadingText('Vui lòng ký yêu cầu xóa thành viên...');
        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang gửi đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget_id: currentBudgetId,
                type: "REMOVE_MEMBER",
                target_address: targetAddress,
                proposer_address: connectedAddress,
                nonce: nonce,
                deadline: deadline,
                signature: signature,
                new_threshold: newThreshold
            })
        });

        if (response.ok) {
            showToast('success', 'Đã tạo đề xuất xóa thành viên thành công!');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi tạo đề xuất');
        }

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

function openJoinBudgetModal() {
    document.getElementById('join-budget-modal').classList.remove('hidden');
}

async function handleJoinBudget(event) {
    event.preventDefault();
    const budgetId = document.getElementById('join-budget-id').value.trim();

    if (!budgetId) {
        showToast('error', 'Vui lòng nhập mã ID của quỹ!');
        return;
    }

    if (!connectedAddress) {
        showToast('error', 'Vui lòng kết nối ví MetaMask!');
        return;
    }

    showLoading('Đang gửi yêu cầu tham gia...');

    try {
        // Lấy thông tin thành viên hiện tại để tham gia
        // Nếu người dùng chưa có profile, ta lấy tên mặc định từ ví
        let memberName = 'Thành viên mới';
        try {
            const memberResponse = await fetch(`${API_BASE_URL}/members/?address=${connectedAddress}`);
            if (memberResponse.ok) {
                const memberData = await memberResponse.json();
                memberName = memberData.name;
            }
        } catch (e) {
            console.log('Using default name as member profile not found');
        }

        const memberData = {
            name: memberName,
            address: connectedAddress,
            role: 'Thành viên',
            avatar: memberName.charAt(0).toUpperCase()
        };

        const response = await fetch(`${API_BASE_URL}/budgets/${budgetId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(memberData)
        });

        if (response.ok) {
            showToast('success', 'Bạn đã tham gia quỹ thành công!');
            closeModal('join-budget-modal');
            document.getElementById('join-budget-form').reset();

            // Cập nhật lại danh sách quỹ
            if (currentStep === 'budget-management') {
                renderBudgetManagement();
            } else {
                renderBudgets();
            }
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Không tìm thấy quỹ với ID này hoặc bạn đã là thành viên.');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}

function copyBudgetId() {
    const budgetId = document.getElementById('budget-id-display').textContent;
    if (budgetId && budgetId !== '---') {
        navigator.clipboard.writeText(budgetId).then(() => {
            showToast('success', 'Đã sao chép mã ID quỹ!');
        }).catch(err => {
            showToast('error', 'Không thể sao chép mã ID');
        });
    }
}

function copyVaultAddress() {
    const vaultAddress = document.getElementById('budget-vault-address').textContent;
    if (vaultAddress && vaultAddress !== '0x...' && vaultAddress !== 'N/A') {
        navigator.clipboard.writeText(vaultAddress).then(() => {
            showToast('success', 'Đã sao chép địa chỉ Vault!');
        }).catch(err => {
            showToast('error', 'Không thể sao chép địa chỉ Vault');
        });
    }
}

async function handleDeleteBudget() {
    if (!currentBudgetId) return;

    const confirmed = confirm('Bạn có chắc chắn muốn xóa quỹ này không? Hành động này không thể hoàn tác.');
    if (!confirmed) return;

    showLoading('Đang xóa quỹ...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}?address=${connectedAddress}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('success', 'Đã xóa quỹ thành công!');
            currentBudgetId = null;
            goToBudgetManagement();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Không thể xóa quỹ');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}

async function handleDeleteBudgetById(budgetId) {
    if (!budgetId) return;

    const confirmed = confirm('Bạn có chắc chắn muốn xóa quỹ này không?');
    if (!confirmed) return;

    showLoading('Đang xóa quỹ...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${budgetId}?address=${connectedAddress}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('success', 'Đã xóa quỹ thành công!');
            renderBudgetManagement();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Không thể xóa quỹ');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}

async function handleRemoveMember(address) {
    if (!currentBudgetId || !address) return;

    const confirmed = confirm('Bạn có chắc chắn muốn xóa thành viên này khỏi quỹ?');
    if (!confirmed) return;

    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget) throw new Error('Không tìm thấy dữ liệu quỹ');

        // Nếu là Quỹ thường (không có Vault)
        if (!budget.vault_address) {
            showLoading('Đang xóa thành viên...');
            const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/members/${address}?operator_address=${connectedAddress}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                showToast('success', 'Đã xóa thành viên khỏi quỹ!');
                openBudgetDashboard(currentBudgetId);
            } else {
                const err = await response.json();
                throw new Error(err.detail || 'Không thể xóa thành viên');
            }
            return;
        }

        // --- GIAO THỨC MULTI-SIG (EIP-712) CHO XÓA THÀNH VIÊN ---
        showLoading('Đang khởi tạo đề xuất xóa thành viên...');
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        
        // TỰ ĐỘNG TÍNH THRESHOLD QUÁ BÁN: (Số lượng mới / 2) + 1
        const newTotalMembers = budget.members.length - 1;
        const newThreshold = Math.floor(newTotalMembers / 2) + 1;

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            RemoveMemberRequest: [
                { name: "oldMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            oldMember: address,
            newThreshold: BigInt(newThreshold),
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };

        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang gửi đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget_id: currentBudgetId,
                type: 'REMOVE_MEMBER',
                target_address: address,
                proposer_address: connectedAddress,
                nonce: nonce,
                deadline: deadline,
                signature: signature,
                new_threshold: parseInt(newThreshold)
            })
        });

        if (response.ok) {
            showToast('success', 'Đã tạo đề xuất xóa thành viên thành công!');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi tạo đề xuất');
        }

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

// ========== Tính năng Nạp Tiền (Deposit) ==========

async function openDepositModal() {
    if (!currentBudgetId) return;

    // Lấy số dư ví hiện tại để hiển thị
    const balanceEth = await getOnChainBalance(connectedAddress);
    document.getElementById('deposit-wallet-balance').textContent = parseFloat(balanceEth).toFixed(4);
    
    document.getElementById('deposit-modal').classList.remove('hidden');
    document.getElementById('deposit-amount').focus();
}

async function handleDeposit(event) {
    event.preventDefault();
    const amount = document.getElementById('deposit-amount').value;
    
    if (!amount || parseFloat(amount) <= 0) {
        showToast('error', 'Số lượng nạp không hợp lệ!');
        return;
    }

    showLoading('Đang khởi tạo giao dịch nạp tiền...');

    try {
        // 0. Kiểm tra mạng
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) {
            hideLoading();
            return;
        }

        // 1. Lấy thông tin quỹ để lấy vault_address
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        if (!budget || !budget.vault_address) {
            throw new Error('Không tìm thấy địa chỉ Vault của quỹ này!');
        }

        updateLoadingText('Đang chờ xác nhận từ MetaMask...');

        // 2. Thực hiện giao dịch chuyển ETH từ ví chính vào Vault
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const tx = await signer.sendTransaction({
            to: budget.vault_address,
            value: ethers.parseEther(amount)
        });

        updateLoadingText('Đang chờ mạng lưới xác nhận nạp tiền...');
        const receipt = await tx.wait();

        // 3. Tính phí gas
        let gasFee = 0;
        try {
            const feeWei = receipt.gasUsed * receipt.gasPrice;
            gasFee = parseFloat(ethers.formatEther(feeWei));
        } catch (e) { console.error(e); }

        updateLoadingText('Cập nhật dữ liệu hệ thống...');

        // 4. Gọi API backend để đồng bộ số dư và ghi log
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                tx_hash: receipt.hash,
                sender_address: connectedAddress,
                gas_fee: gasFee
            })
        });

        if (response.ok) {
            showToast('success', `Đã nạp ${amount} ETH vào quỹ thành công!`);
            closeModal('deposit-modal');
            document.getElementById('deposit-form').reset();
            
            // Cập nhật UI chuẩn xác bằng cách tải lại dữ liệu quỹ
            openBudgetDashboard(currentBudgetId);
            renderMainTransactions();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi đồng bộ dữ liệu nạp tiền');
        }

    } catch (error) {
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') {
            errorMsg = 'Bạn đã từ chối giao dịch.';
        }
        showToast('error', 'Nạp tiền thất bại: ' + errorMsg);
        console.error('Deposit Error:', error);
    } finally {
        hideLoading();
    }
}

// ========== Tính năng Rút Tiền (Withdraw) ==========

async function openWithdrawModal() {
    if (!currentBudgetId) return;

    // Lấy số dư hiện tại của quỹ
    const budgetBalance = document.getElementById('budget-balance').textContent;
    document.getElementById('withdraw-budget-balance').textContent = budgetBalance;
    
    // Mặc định người nhận là địa chỉ ví đang kết nối
    document.getElementById('withdraw-to').value = connectedAddress;
    
    document.getElementById('withdraw-modal').classList.remove('hidden');
    document.getElementById('withdraw-amount').focus();
}

function selectSpendingSuggestion(name, icon) {
    const titleInput = document.getElementById('withdraw-title');
    titleInput.value = `${icon} ${name}: `;
    titleInput.focus();
}

async function handleWithdraw(event) {
    event.preventDefault();
        const title = document.getElementById('withdraw-title').value.trim();
        const to = document.getElementById('withdraw-to').value.trim();
        const amount = document.getElementById('withdraw-amount').value.trim();
    
    if (!amount || parseFloat(amount) <= 0) {
        showToast('error', 'Số lượng rút không hợp lệ!');
        return;
    }

    if (!to || !to.startsWith('0x') || to.length !== 42) {
        showToast('error', 'Địa chỉ người nhận không hợp lệ!');
        return;
    }

    showLoading('Đang chuẩn bị bản tin ký...');

    try {
        // 0. Kiểm tra mạng
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) {
            hideLoading();
            return;
        }

        // 1. Lấy thông tin quỹ để lấy vault_address
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        if (!budget || !budget.vault_address) {
            throw new Error('Không tìm thấy địa chỉ Vault của quỹ này!');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        // 2. Chuẩn bị dữ liệu EIP-712
        const nonce = Date.now(); 
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const amountWei = ethers.parseEther(amount);

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            WithdrawRequest: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            to: to,
            amount: amountWei,
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');

        // 3. Yêu cầu ký EIP-712
        const signature = await signer.signTypedData(domain, types, value);

        console.log('Signature created:', signature);

        // 4. Luôn tạo đề xuất trên hệ thống để quản lý tập trung
        updateLoadingText('Đang lưu đề xuất lên hệ thống...');

        // Gửi đề xuất và chữ ký lên Backend
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests?address=${connectedAddress}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                to: to,
                amount: parseFloat(amount),
                nonce: Number(nonce),
                deadline: Number(deadline),
                signature: signature
            })
        });

        if (response.ok) {
            showToast('success', 'Đề xuất rút tiền đã được tạo thành công!');
            closeModal('withdraw-modal');
            document.getElementById('withdraw-form').reset();
            
            // Cập nhật lại danh sách đề xuất chờ
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi lưu đề xuất rút tiền');
        }

    } catch (error) {
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') {
            errorMsg = 'Bạn đã từ chối giao dịch.';
        } else if (error.data && error.data.message) {
            errorMsg = error.data.message;
        }
        showToast('error', 'Lỗi rút tiền: ' + errorMsg);
        console.error('Withdraw Error:', error);
    } finally {
        hideLoading();
    }
}

async function fetchAndRenderPendingProposals() {
    if (!currentBudgetId) return;
    
    try {
        // 1. Fetch Withdraw Requests
        const withdrawResponse = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`);
        const withdrawRequests = withdrawResponse.ok ? await withdrawResponse.json() : [];
        
        // 2. Fetch Membership Proposals
        const proposalResponse = await fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`);
        const membershipProposals = proposalResponse.ok ? await proposalResponse.json() : [];
        
        renderPendingProposals(withdrawRequests, membershipProposals);
    } catch (e) { console.error(e); }
}

async function renderPendingProposals(withdrawRequests, membershipProposals) {
    const container = document.getElementById('pending-withdraw-container');
    const list = document.getElementById('pending-withdraw-list');
    
    if (!container || !list) return;

    const pendingWithdraw = withdrawRequests.filter(r => r.status === 'pending');
    const pendingMembership = membershipProposals.filter(r => r.status === 'pending');
    
    if (pendingWithdraw.length === 0 && pendingMembership.length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    list.innerHTML = '';
    
    const budgetList = await fetchBudgets();
    const budget = budgetList.find(b => b.id === currentBudgetId);
    
    let threshold = 1; 
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        threshold = Number(await vaultContract.threshold());
    } catch (e) { console.error("Error fetching threshold:", e); }

    // Render Withdraw Requests
    pendingWithdraw.forEach(req => {
        const memberCount = budget.members.length;
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount > memberCount / 2;

        const card = createProposalCard({
            id: req.id,
            title: req.title || `Rút ${req.amount} ETH`,
            subtitle: `Đến: ${req.to.substring(0, 6)}...${req.to.substring(38)} | Số tiền: ${req.amount} ETH`,
            sigCount,
            totalMembers: memberCount,
            hasSigned,
            canExecute,
            onSign: () => handleApproveWithdraw(req.id),
            onExecute: () => handleExecuteWithdraw(req.id),
            onCancel: () => handleCancelWithdraw(req.id)
        });
        list.appendChild(card);
    });

    // Render Membership Proposals
    pendingMembership.forEach(req => {
        const memberCount = budget.members.length;
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount > memberCount / 2;
        
        const typeLabel = req.type === 'ADD_MEMBER' ? 'Thêm' : 'Xóa';

        const card = createProposalCard({
            id: req.id,
            title: `${typeLabel} thành viên`,
            subtitle: `Địa chỉ: ${req.target_address.substring(0, 6)}...${req.target_address.substring(38)}`,
            sigCount,
            totalMembers: memberCount,
            hasSigned,
            canExecute,
            onSign: () => handleApproveMembershipProposal(req.id),
            onExecute: () => handleExecuteMembershipProposal(req.id),
            onCancel: () => handleCancelProposal(req.id)
        });
        list.appendChild(card);
    });
}

function createProposalCard({ id, title, subtitle, sigCount, totalMembers, hasSigned, canExecute, onSign, onExecute, onCancel }) {
    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.style.padding = '15px';
    card.style.border = '1px solid var(--warning)';
    card.style.background = 'rgba(255, 152, 0, 0.05)';
    card.style.marginBottom = '12px';
    card.style.borderRadius = '12px';
    
    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
            <div>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 16px;">${title}</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${subtitle}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 12px; font-weight: 700; color: var(--warning);">${sigCount}/${totalMembers} chữ ký</div>
            </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
            ${!hasSigned ? `
                <button class="btn btn-primary btn-sm sign-btn" style="flex: 1; padding: 6px; font-size: 12px; background: var(--warning); border: none;">Ký phê duyệt</button>
            ` : `
                <button class="btn btn-sm" disabled style="flex: 1; padding: 6px; font-size: 12px; opacity: 0.6; background: rgba(255,255,255,0.1); border: 1px solid var(--border);">Đã ký</button>
            `}
            
            ${canExecute ? `
                <button class="btn btn-success btn-sm execute-btn" style="flex: 1; padding: 6px; font-size: 12px; border: none;">Thực thi</button>
            ` : ''}

            <button class="btn btn-sm cancel-btn" style="padding: 6px; font-size: 12px; background: rgba(255, 82, 82, 0.1); color: #ff5252; border: 1px solid #ff5252;">Hủy</button>
        </div>
    `;
    
    if (!hasSigned) card.querySelector('.sign-btn').onclick = onSign;
    if (canExecute) card.querySelector('.execute-btn').onclick = onExecute;
    card.querySelector('.cancel-btn').onclick = onCancel;
    
    return card;
}

async function handleApproveWithdraw(requestId) {
    showLoading('Đang chuẩn bị ký phê duyệt...');
    
    try {
        const budgetResponse = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`);
        const requests = await budgetResponse.json();
        const req = requests.find(r => r.id === requestId);
        
        if (!req) throw new Error('Không tìm thấy yêu cầu');

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            WithdrawRequest: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            to: req.to,
            amount: ethers.parseUnits(req.amount.toString(), 18),
            nonce: BigInt(req.nonce),
            deadline: BigInt(req.deadline)
        };

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang cập nhật chữ ký...');
        const signResponse = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/sign?address=${connectedAddress}&signature=${signature}`, {
            method: 'POST'
        });

        if (signResponse.ok) {
            showToast('success', 'Đã phê duyệt đề xuất! Vui lòng chờ hệ thống kiểm tra và thực thi tự động...');
            
            // Đợi 2 giây để Relayer Backend xử lý xong trên Blockchain
            setTimeout(() => {
                fetchAndRenderPendingProposals();
                // Load lại budget dashboard để cập nhật số dư mới
                if (typeof openBudgetDashboard === 'function') {
                    openBudgetDashboard(currentBudgetId);
                }
            }, 2000);
        } else {
            const err = await signResponse.json();
            throw new Error(err.detail || 'Lỗi khi gửi chữ ký');
        }

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

async function handleExecuteWithdraw(requestId) {
    showLoading('Đang chuẩn bị thực thi giao dịch...');
    
    try {
        const budgetResponse = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`);
        const requests = await budgetResponse.json();
        const req = requests.find(r => r.id === requestId);
        
        if (!req) throw new Error('Không tìm thấy yêu cầu');

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Lọc để mỗi ví chỉ có 1 chữ ký duy nhất
        const uniqueSignaturesMap = new Map();
        req.signatures.forEach(s => {
            uniqueSignaturesMap.set(s.signer_address.toLowerCase(), s.signature);
        });

        const sortedSignatures = Array.from(uniqueSignaturesMap.entries())
            .sort((a, b) => a[0] < b[0] ? -1 : 1)
            .map(entry => entry[1]);

        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);

        updateLoadingText('Đang gửi giao dịch lên Blockchain...');
        
        const tx = await vaultContract.executeWithdraw(
            req.to,
            ethers.parseUnits(req.amount.toString(), 18),
            BigInt(req.nonce),
            BigInt(req.deadline),
            sortedSignatures
        );

        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();

        await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/executed?tx_hash=${receipt.hash}`, {
            method: 'POST'
        });

        showToast('success', 'Tiền đã được rút thành công!');
        fetchAndRenderPendingProposals();
        refreshBalances();

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

async function handleApproveMembershipProposal(proposalId) {
    showLoading('Đang chuẩn bị ký phê duyệt...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`);
        const proposals = await response.json();
        const req = proposals.find(p => p.id === proposalId);
        
        if (!req) throw new Error('Không tìm thấy đề xuất');

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };

        const types = {};
        const value = {
            nonce: BigInt(req.nonce),
            deadline: BigInt(req.deadline),
            newThreshold: BigInt(req.new_threshold)
        };

        if (req.type === 'ADD_MEMBER') {
            types.AddMemberRequest = [
                { name: "newMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ];
            value.newMember = req.target_address;
        } else {
            types.RemoveMemberRequest = [
                { name: "oldMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ];
            value.oldMember = req.target_address;
        }

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang cập nhật chữ ký...');
        const signResponse = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                voter_address: connectedAddress,
                signature: signature
            })
        });

        if (signResponse.ok) {
            showToast('success', 'Đã phê duyệt đề xuất thành công! Hệ thống đang kiểm tra để thực thi tự động...');
            
            setTimeout(() => {
                fetchAndRenderPendingProposals();
                if (typeof openBudgetDashboard === 'function') {
                    openBudgetDashboard(currentBudgetId);
                }
            }, 2000);
        } else {
            const err = await signResponse.json();
            throw new Error(err.detail || 'Lỗi khi gửi chữ ký');
        }

    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

async function handleExecuteMembershipProposal(proposalId) {
    showLoading('Đang chuẩn bị thực thi giao dịch...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`);
        const proposals = await response.json();
        const req = proposals.find(p => p.id === proposalId);
        
        if (!req) throw new Error('Không tìm thấy đề xuất');

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const sortedSignatures = [...req.signatures]
            .sort((a, b) => a.signer_address.toLowerCase() < b.signer_address.toLowerCase() ? -1 : 1)
            .map(s => s.signature);

        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);

        updateLoadingText('Đang gửi giao dịch lên Blockchain...');
        
        let tx;
        if (req.type === 'ADD_MEMBER') {
            tx = await vaultContract.executeAddMember(
                req.target_address,
                BigInt(req.new_threshold),
                BigInt(req.nonce),
                BigInt(req.deadline),
                sortedSignatures
            );
        } else {
            tx = await vaultContract.executeRemoveMember(
                req.target_address,
                BigInt(req.new_threshold),
                BigInt(req.nonce),
                BigInt(req.deadline),
                sortedSignatures
            );
        }

        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();

        await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/execute?tx_hash=${receipt.hash}`, {
            method: 'POST'
        });

        showToast('success', 'Đề xuất đã được thực thi thành công!');
        fetchAndRenderPendingProposals();
        // Load lại budget dashboard
        const budgetData = await (await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}`)).json();
        renderBudgetDashboard(budgetData);
    } catch (error) {
        showToast('error', error.message);
        console.error(error);
    } finally {
        hideLoading();
    }
}

/**
 * Mở modal danh sách thành viên toàn hệ thống
 */
async function openSystemMembersModal() {
    document.getElementById('system-members-modal').classList.remove('hidden');
    const listEl = document.getElementById('system-members-list');
    
    listEl.innerHTML = '<div class="empty-state"><p>Đang tải danh sách thành viên...</p></div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/members/all`);
        if (response.ok) {
            allSystemMembers = await response.json();
            renderSystemMembers(allSystemMembers);
        } else {
            showToast('error', 'Không thể tải danh sách thành viên');
        }
    } catch (err) {
        console.error(err);
        showToast('error', 'Lỗi kết nối server');
    }
}

/**
 * Hiển thị danh sách thành viên hệ thống
 */
function renderSystemMembers(members) {
    const listEl = document.getElementById('system-members-list');
    if (!listEl) return;

    if (members.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Không tìm thấy thành viên nào</p></div>';
        return;
    }

    listEl.innerHTML = '';
    members.forEach(member => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.style.cursor = 'pointer';
        div.style.padding = '12px';
        div.style.background = 'rgba(255, 255, 255, 0.03)';
        div.style.borderRadius = '10px';
        div.style.transition = '0.2s';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '12px';
        div.style.marginBottom = '8px';
        
        div.onclick = () => selectMemberFromDirectory(member);
        
        div.onmouseover = () => div.style.background = 'rgba(255, 255, 255, 0.08)';
        div.onmouseout = () => div.style.background = 'rgba(255, 255, 255, 0.03)';

        div.innerHTML = `
            <div class="member-avatar" style="width: 40px; height: 40px; background: var(--purple-primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">
                ${member.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-details" style="display: flex; flex-direction: column;">
                <span class="member-name" style="font-weight: 600; color: var(--text-primary);">${member.name}</span>
                <span class="member-address" style="font-size: 11px; color: var(--text-secondary); opacity: 0.7;">${shortenAddress(member.member_address)}</span>
            </div>
            <div class="select-indicator" style="margin-left: auto; color: var(--purple-primary);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;
        listEl.appendChild(div);
    });
}

/**
 * Lọc danh sách thành viên theo input tìm kiếm
 */
function filterSystemMembers() {
    const query = document.getElementById('member-search-input').value.toLowerCase();
    const filtered = allSystemMembers.filter(m => 
        m.name.toLowerCase().includes(query) || 
        m.member_address.toLowerCase().includes(query)
    );
    renderSystemMembers(filtered);
}

/**
 * Chọn thành viên từ danh sách và điền vào form
 */
function selectMemberFromDirectory(member) {
    const addressInput = document.getElementById('new-member-address');
    if (addressInput) {
        addressInput.value = member.member_address;
        // Kích hoạt sự kiện input để UI cập nhật (hiển thị trạng thái kiểm tra ví)
        const event = new Event('input', { bubbles: true });
        addressInput.dispatchEvent(event);
    }
    closeModal('system-members-modal');
}

async function handleCancelProposal(proposalId) {
    if (!confirm('Bạn có chắc chắn muốn hủy đề xuất này?')) return;
    
    showLoading('Đang hủy đề xuất...');
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}?operator_address=${connectedAddress}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('success', 'Đã hủy đề xuất thành công');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Không thể hủy đề xuất');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}

async function handleCancelWithdraw(requestId) {
    if (!confirm('Bạn có chắc chắn muốn hủy yêu cầu rút tiền này?')) return;
    
    showLoading('Đang hủy yêu cầu...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}?operator_address=${connectedAddress}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showToast('success', 'Đã hủy yêu cầu rút tiền thành công');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Không thể hủy yêu cầu');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}

function openChangeThresholdModal() {
    openModal('change-threshold-modal');
}

async function handleChangeThreshold(event) {
    event.preventDefault();
    const newThreshold = document.getElementById('new-threshold-input').value;
    
    if (!newThreshold || newThreshold < 1) {
        showToast('error', 'Ngưỡng phê duyệt không hợp lệ');
        return;
    }

    showLoading('Đang khởi tạo đề xuất thay đổi ngưỡng...');
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: (await provider.getNetwork()).chainId,
            verifyingContract: budget.vault_address
        };

        const types = {
            AddMemberRequest: [
                { name: "newMember", type: "address" },
                { name: "newThreshold", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const value = {
            newMember: connectedAddress, 
            newThreshold: BigInt(newThreshold),
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };

        const signature = await signer.signTypedData(domain, types, value);

        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                budget_id: currentBudgetId,
                type: 'ADD_MEMBER',
                target_address: connectedAddress,
                proposer_address: connectedAddress,
                new_threshold: parseInt(newThreshold),
                nonce: nonce,
                deadline: deadline,
                signature: signature
            })
        });

        if (response.ok) {
            showToast('success', 'Đề xuất thay đổi ngưỡng đã được tạo!');
            closeModal('change-threshold-modal');
            fetchAndRenderPendingProposals();
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi tạo đề xuất');
        }
    } catch (error) {
        showToast('error', error.message);
    } finally {
        hideLoading();
    }
}
