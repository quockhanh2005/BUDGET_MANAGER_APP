/* ========================================
   Budget Dashboard (Chi tiết Quỹ)
   ======================================== */

async function openBudgetDashboard(budgetId) {
    currentBudgetId = budgetId;
    showLoading('Đang tải dữ liệu quỹ...');
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === budgetId);
        if (!budget) { hideLoading(); showToast('error', 'Không tìm thấy thông tin quỹ'); return; }
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
    budget.members = budget.members || [];
    budget.rules = budget.rules || [];
    budget.transactions = budget.transactions || [];

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

    let displayBalance = budget.balance || 0;
    if (budget.vault_address && budget.vault_address !== 'n/a') {
        try { const onChainBal = await getOnChainBalance(budget.vault_address); displayBalance = parseFloat(onChainBal); }
        catch (e) { console.warn('Could not fetch on-chain balance:', e); }
    }
    const balanceEl = document.getElementById('budget-balance');
    if (balanceEl) animateNumber('budget-balance', 0, displayBalance, 800);

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
            div.innerHTML = `<span class="rule-name">${rule.name || ''}</span><span class="rule-desc">${rule.desc || ''}</span>`;
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

    fetchAndRenderPendingProposals();
}
