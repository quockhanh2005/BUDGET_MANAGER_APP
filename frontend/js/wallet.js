/* ========================================
   Quản lý Ví MetaMask (Wallet)
   ======================================== */

// ========== Kiểm tra MetaMask ==========
function checkMetaMaskInstalled() {
    if (typeof window.ethereum === 'undefined') {
        showToast('error', 'MetaMask chưa được cài đặt! Vui lòng cài đặt MetaMask extension để tiếp tục.');
        const btn = document.getElementById('btn-connect');
        btn.textContent = 'Cài đặt MetaMask';
        btn.onclick = () => window.open('https://metamask.io/download/', '_blank');
    }
}

// ========== Kết nối ví ==========
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

// ========== Cập nhật giao diện ví ==========
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
    const walletDisplay = document.getElementById('wallet-display');
    if (walletDisplay) walletDisplay.value = connectedAddress;

    // Cập nhật trạng thái hiển thị mạng
    updateNetworkUIStatus(connectedChainId);
}

// ========== Tên mạng ==========
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

// ========== Lắng nghe thay đổi tài khoản ==========
function listenForAccountChanges() {
    if (typeof window.ethereum === 'undefined') return;

    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            // Người dùng ngắt kết nối
            if (connectedAddress !== null) {
                connectedAddress = null;
                resetToStep1();
                showToast('info', 'Ví đã bị ngắt kết nối.');
            }
        } else {
            if (connectedAddress !== accounts[0]) {
                connectedAddress = accounts[0];
                updateWalletUI();
                showToast('info', 'Đã chuyển sang tài khoản mới.');
                // Làm mới dữ liệu khi đổi tài khoản
                refreshBalances();
            }
        }
    });

    window.ethereum.on('chainChanged', (chainId) => {
        if (connectedChainId === chainId) return; // Tránh loop nếu chain không đổi
        
        console.log('Chain changed to:', chainId);
        connectedChainId = chainId;
        const networkName = getNetworkName(chainId);

        // Cập nhật giao diện Wizard (nếu còn)
        const wizardNetworkEl = document.getElementById('network-name');
        if (wizardNetworkEl) wizardNetworkEl.textContent = networkName;

        // Cập nhật giao diện Dashboard
        const dashNetworkEl = document.getElementById('dashboard-wallet-status');
        if (dashNetworkEl) dashNetworkEl.textContent = `Đang kết nối: ${networkName}`;

        updateNetworkUIStatus(chainId);
        showToast('info', `Đã chuyển mạng: ${networkName}`);

        // Làm mới dữ liệu khi chuyển mạng
        refreshBalances();

        // Nếu không phải Sepolia, cảnh báo người dùng
        if (chainId !== BLOCKCHAIN_NETWORK_ID && chainId !== '0x539') {
            showToast('error', 'Cảnh báo: Bạn đã rời khỏi mạng Sepolia!');
        }
    });
}

// ========== Lấy số dư ETH từ Blockchain ==========
async function getOnChainBalance(address) {
    if (!window.ethereum || !address) return "0.0000";
    try {
        const balanceHex = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [address, 'latest']
        });
        
        console.log(`Raw balance for ${address}:`, balanceHex);
        
        if (typeof ethers !== 'undefined') {
            return ethers.formatEther(balanceHex);
        } else {
            // Fallback nếu không có ethers
            const wei = BigInt(balanceHex);
            return (Number(wei) / 1e18).toString();
        }
    } catch (e) {
        console.error("Lỗi khi lấy số dư cho " + address, e);
        return "0.0000";
    }
}

// ========== Làm mới số dư ==========
let isRefreshing = false; 
let lastRefreshTime = 0; 
let refreshTimeout = null; // Quản lý trì hoãn refresh

async function refreshBalances() {
    const now = Date.now();
    const MIN_INTERVAL = 3000; // Tăng lên 3 giây để an toàn tuyệt đối khi chạy nhiều tab

    // 1. Nếu đang refresh hoặc vừa refresh xong chưa quá 3s, bỏ qua
    if (isRefreshing || (now - lastRefreshTime < MIN_INTERVAL)) {
        // Nếu có yêu cầu mới, đợi một chút rồi thử lại (debounce)
        if (!refreshTimeout) {
            refreshTimeout = setTimeout(() => {
                refreshTimeout = null;
                refreshBalances();
            }, MIN_INTERVAL);
        }
        return;
    }
    
    if (refreshTimeout) {
        clearTimeout(refreshTimeout);
        refreshTimeout = null;
    }

    isRefreshing = true;
    lastRefreshTime = now;

    const promises = [];

    try {
        if (!connectedAddress) {
            isRefreshing = false;
            return;
        }

        console.log(`--- [CORE] Refreshing balances for ${shortenAddress(connectedAddress)} ---`);
        
        if (typeof renderBudgets === 'function') promises.push(renderBudgets());

        // 3. Cập nhật dữ liệu Quỹ nếu đang ở màn hình Quản lý Quỹ
        if (currentStep === 'budget-management' && typeof renderBudgetManagement === 'function') {
            promises.push(renderBudgetManagement()); 
        }
        
        // 4. Cập nhật số dư quỹ cụ thể nếu đang xem chi tiết quỹ
        if (currentStep === 'budget-dashboard' && currentBudgetId) {
            const budgetPromise = fetchBudgets().then(async (budgetList) => {
                const budget = budgetList.find(b => b.id === currentBudgetId);
                if (budget && budget.vault_address) {
                    const onChainBal = await getOnChainBalance(budget.vault_address);
                    const budgetBalEl = document.getElementById('budget-balance');
                    if (budgetBalEl) {
                        const currentVal = budgetBalEl.textContent;
                        if (Math.abs(parseFloat(currentVal || 0) - parseFloat(onChainBal)) > 0.00001) {
                             animateNumber('budget-balance', parseFloat(currentVal || 0), parseFloat(onChainBal), 800);
                        }
                    }
                }
            });
            promises.push(budgetPromise);
        }

        await Promise.all(promises);
    } catch (err) {
        console.error('Error during refreshBalances:', err);
    } finally {
        isRefreshing = false;
    }
}

/**
 * Khởi động cơ chế tự động làm mới
 */
function startBalanceAutoRefresh() {
    // 1. Xóa interval cũ nếu có để tránh trùng lặp
    if (balanceRefreshInterval) {
        clearInterval(balanceRefreshInterval);
        balanceRefreshInterval = null;
    }

    // 2. Cập nhật ngay lập tức khi khởi động
    refreshBalances();

    // 3. Thiết lập Polling (cứ 15 giây một lần - tăng lên 15s để an toàn tuyệt đối)
    balanceRefreshInterval = setInterval(() => {
        console.log('--- Auto refreshing balances (Polling) ---');
        refreshBalances();
    }, 15000);

    /* Tạm thời tắt Block Listener để tránh request storm
    if (typeof ethers !== 'undefined' && !isBlockListenerActive) {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            provider.on('block', (blockNumber) => {
                console.log('New block mined:', blockNumber, '- Refreshing data...');
                refreshBalances();
            });
            isBlockListenerActive = true;
        } catch (e) {
            console.warn('Không thể thiết lập Block Listener:', e);
        }
    }
    */
}

// ========== Xử lý Dropdown Mạng ==========
function toggleNetworkDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('network-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
    }
}

// Đóng dropdown khi click bên ngoài
document.addEventListener('click', () => {
    const dropdown = document.getElementById('network-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
    }
});

// Chuyển mạng
async function handleSwitchNetwork(chainId, event) {
    if (event) event.stopPropagation();
    toggleNetworkDropdown();

    if (typeof window.ethereum === 'undefined') return;

    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainId }],
        });
    } catch (switchError) {
        // Lỗi 4902: Mạng chưa được thêm vào MetaMask
        if (switchError.code === 4902) {
            try {
                // Thêm mạng Sepolia nếu chưa có (ví dụ)
                if (chainId === '0xaa36a7') {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: '0xaa36a7',
                            chainName: 'Sepolia Testnet',
                            nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
                            rpcUrls: ['https://rpc.sepolia.org'],
                            blockExplorerUrls: ['https://sepolia.etherscan.io']
                        }]
                    });
                } else {
                    showToast('error', 'Vui lòng tự thêm mạng này vào MetaMask.');
                }
            } catch (addError) {
                showToast('error', 'Không thể thêm mạng mới.');
            }
        } else {
            showToast('error', 'Không thể chuyển mạng.');
        }
    }
}

// Cập nhật UI trạng thái mạng (Cảnh báo nếu sai mạng)
function updateNetworkUIStatus(chainId) {
    const displayEl = document.getElementById('current-network-display');
    if (!displayEl) return;

    if (chainId !== BLOCKCHAIN_NETWORK_ID && chainId !== '0x539') {
        displayEl.classList.add('wrong-network');
    } else {
        displayEl.classList.remove('wrong-network');
    }
    
    // Cập nhật active class trong dropdown
    document.querySelectorAll('.network-option').forEach(opt => {
        const optChainId = opt.getAttribute('onclick').match(/'(0x[a-f0-9]+)'/)[1];
        if (optChainId === chainId) {
            opt.classList.add('active');
        } else {
            opt.classList.remove('active');
        }
    });
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

// ========== Ẩn/hiện số dư ==========
function toggleBalanceVisibility() {
    const balanceContainer = document.querySelector('.balance-amount');
    const eyeIcon = document.getElementById('eye-icon');
    isBalanceHidden = !isBalanceHidden;
    
    if (!balanceContainer || !eyeIcon) return;

    if (isBalanceHidden) {
        balanceContainer.classList.add('hidden-balance');
        // Đổi icon sang mắt gạch chéo (Eye Off)
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
        showToast('info', 'Số dư đã được ẩn');
    } else {
        balanceContainer.classList.remove('hidden-balance');
        // Đổi lại icon mắt bình thường
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `;
    }
}
