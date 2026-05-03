/* ========================================
   Dashboard chính (Main Dashboard)
   ======================================== */

async function renderDashboard(member) {
    console.log('Rendering dashboard for:', member.name);
    
    // Đảm bảo giao diện Dashboard được hiển thị ngay lập tức
    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    const dashboardEl = document.getElementById('step-dashboard');
    if (dashboardEl) dashboardEl.classList.add('active');
    
    const container = document.querySelector('.container');
    if (container) container.classList.add('wide');
    
    const stepsEl = document.querySelector('.steps');
    if (stepsEl) stepsEl.style.display = 'none';

    // Ẩn thẻ wizard chính
    const wizardEl = document.getElementById('main-wizard');
    if (wizardEl) wizardEl.classList.add('hidden');

    // Cập nhật thông tin cơ bản
    document.getElementById('dashboard-user-name').textContent = `Chào mừng, ${member.name}`;
    document.getElementById('dashboard-member-id').textContent = member.member_id;
    document.getElementById('dashboard-email').textContent = member.email || 'N/A';
    document.getElementById('dashboard-address').textContent = member.member_address;

    const joinDate = member.created_at ? new Date(member.created_at).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN');
    document.getElementById('dashboard-created-at').textContent = joinDate;

    // Load dữ liệu Blockchain (không đợi để tránh block UI)
    if (typeof window.ethereum !== 'undefined' && connectedAddress) {
        getOnChainBalance(connectedAddress).then(balanceEth => {
            animateNumber('dashboard-balance', 0, parseFloat(balanceEth), 1000);
        }).catch(err => console.error('Error fetching balance:', err));

        window.ethereum.request({ method: 'eth_chainId' }).then(chainId => {
            const networkName = getNetworkName(chainId);
            document.getElementById('dashboard-wallet-status').textContent = `Đang kết nối: ${networkName}`;
        }).catch(err => console.error('Error fetching chainId:', err));
    }

    renderMainTransactions();
    renderBudgets();
    currentStep = 'dashboard';
}

async function renderMainTransactions() {
    const listEl = document.getElementById('main-transaction-list');
    if (!listEl) return;
    const transactions = await fetchMainTransactions();
    if (transactions.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Chưa có giao dịch nào</p></div>';
        return;
    }
    listEl.innerHTML = '';
    transactions.forEach(tx => {
        const div = document.createElement('div');
        div.className = 'transaction-item';
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

async function fetchMainTransactions() {
    if (!connectedAddress) return [];
    try {
        const response = await fetch(`${API_BASE_URL}/wallet/history?address=${connectedAddress}`);
        if (response.ok) return await response.json();
    } catch (err) { console.error('Error fetching history from backend:', err); }
    const localLogs = JSON.parse(localStorage.getItem(`tx_logs_${connectedAddress}`) || '[]');
    return localLogs.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function logTransaction(txData) {
    if (!connectedAddress) return;
    const fullTxData = { ...txData, wallet_address: connectedAddress };
    const logs = JSON.parse(localStorage.getItem(`tx_logs_${connectedAddress}`) || '[]');
    logs.push(fullTxData);
    localStorage.setItem(`tx_logs_${connectedAddress}`, JSON.stringify(logs));
    renderMainTransactions();
    try {
        await fetch(`${API_BASE_URL}/wallet/history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullTxData) });
    } catch (err) { console.error('Error saving transaction to backend:', err); }
}

async function renderBudgets() {
    const listEl = document.getElementById('budgets-list');
    if (!listEl) return;
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
        let displayBalance = budget.balance;
        if (budget.vault_address) { displayBalance = await getOnChainBalance(budget.vault_address); }
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
