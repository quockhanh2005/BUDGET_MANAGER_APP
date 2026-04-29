/* ========================================
   Quản lý ngân sách - Tích hợp MetaMask
   Frontend JavaScript
   ======================================== */

// ========== Cấu hình ==========
const API_BASE_URL = 'http://localhost:8000';
const SIGN_MESSAGE_PREFIX = 'Budget Manager - Xác minh danh tính cho địa chỉ ví: ';

// ========== Trạng thái ==========
let currentStep = 1;
let connectedAddress = null;
let connectedChainId = null;

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
    });
}

// ========== Điều hướng các bước ==========
function goToStep(step) {
    console.log('Going to step:', step);
    const container = document.querySelector('.container');
    
    // Nếu là dashboard, ẩn toàn bộ thanh tiến trình và mở rộng khung
    if (step === 'dashboard') {
        container.classList.add('wide');
        document.querySelector('.steps').style.display = 'none';
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        document.getElementById('step-dashboard').classList.add('active');
        currentStep = 'dashboard';
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
        // SỬA LỖI: Sử dụng Query Parameter ?address=
        const url = `${API_BASE_URL}/members/?address=${connectedAddress}`;
        console.log('Fetching URL:', url);

        const response = await fetch(url, { cache: 'no-store' });
        console.log('Response Status:', response.status);
        
        if (response.ok) {
            const member = await response.json();
            console.log('Member data received:', member);
            hideLoading();
            renderDashboard(member);
            showToast('success', `Chào mừng quay lại, ${member.name}!`);
        } else if (response.status === 404) {
            console.log('Member not found, showing registration form.');
            hideLoading();
            goToStep(2);
        } else {
            const errData = await response.json();
            throw new Error(errData.detail || 'Lỗi server');
        }
    } catch (error) {
        hideLoading();
        console.error('API Error:', error);
        showToast('error', 'Lỗi kết nối: ' + error.message);
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
            const balanceWei = await window.ethereum.request({
                method: 'eth_getBalance',
                params: [connectedAddress, 'latest']
            });
            const balanceEth = (parseInt(balanceWei, 16) / 1e18);
            
            // Hiệu ứng số nhảy cho balance
            animateNumber('dashboard-balance', 0, balanceEth, 1000);
            
            // Cập nhật trạng thái mạng
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            const networkName = chainId === '0x1' ? 'Mainnet' : chainId === '0xaa36a7' ? 'Sepolia' : 'Testnet';
            document.getElementById('dashboard-wallet-status').textContent = `Đang kết nối: ${networkName}`;
        } catch (err) {
            console.error('Error fetching balance:', err);
            document.getElementById('dashboard-balance').textContent = '0.00';
        }
    }

    // Hiện dashboard
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    document.getElementById('step-dashboard').classList.add('active');
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
    renderDashboard(member);
}



// ========== Đặt lại ==========
function resetForm() {
    // Xóa dữ liệu form
    document.getElementById('member-form').reset();

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
