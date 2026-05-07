/* ========================================
   Quản lý Quỹ (Budget CRUD & Management)
   ======================================== */

// ── Filter/sort state ──
let _budgetCache = [];          // raw list from server
let _budgetFilter = 'all';     // 'all' | 'active' | 'inactive'

async function fetchBudgets() {
    if (!connectedAddress) return [];
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/?address=${connectedAddress}`);
        if (response.ok) return await response.json();
        return [];
    } catch (err) { console.error('Fetch Budgets Error:', err); return []; }
}

async function fetchBudgetDetail(budgetId) {
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${budgetId}`);
        if (response.ok) return await response.json();
        return null;
    } catch (err) { console.error('Fetch Budget Detail Error:', err); return null; }
}

function goToBudgetManagement() {
    showLoading('Đang tải trung tâm quản lý quỹ...');
    setTimeout(() => { renderBudgetManagement(); goToStep('budget-management'); hideLoading(); }, 500);
}

async function renderBudgetManagement() {
    const gridEl = document.getElementById('budget-feature-grid');
    if (!gridEl) return;

    const budgetList = await fetchBudgets();
    document.getElementById('total-budgets-count').textContent = budgetList.length;
    document.getElementById('most-active-budget').textContent = budgetList[0]?.name || '--';

    // Fetch on-chain balances in parallel and attach to each budget
    const budgetItems = await Promise.all(budgetList.map(async (budget) => {
        let displayBalance = 0;
        if (budget.vault_address) {
            try {
                const bal = await getOnChainBalance(budget.vault_address);
                displayBalance = parseFloat(bal);
            } catch (e) {
                console.warn(`Balance fetch failed for ${budget.vault_address}:`, e);
                displayBalance = budget.balance ?? 0;
            }
        } else {
            displayBalance = budget.balance ?? 0;
        }
        
        // Determine status: active if balance > 0 OR has more than 1 member
        const isActive = displayBalance > 0 || (budget.members?.length ?? 0) > 1;
        
        return { ...budget, _displayBalance: displayBalance, _isActive: isActive };
    }));

    const totalOnChain = budgetItems.reduce((sum, b) => sum + b._displayBalance, 0);
    document.getElementById('total-budgeted-amount').textContent = totalOnChain.toFixed(4);
    _budgetCache = budgetItems;

    // Update tab counts
    const activeCount   = budgetList.filter(b => b._isActive).length;
    const inactiveCount = budgetList.length - activeCount;
    const elAll      = document.getElementById('count-all');
    const elActive   = document.getElementById('count-active');
    const elInactive = document.getElementById('count-inactive');
    if (elAll)      elAll.textContent      = budgetList.length;
    if (elActive)   elActive.textContent   = activeCount;
    if (elInactive) elInactive.textContent = inactiveCount;

    applyBudgetFilter();
}

// ── Custom Sort Dropdown ──
function toggleSortDropdown(event) {
    event.stopPropagation();
    const wrapper = document.getElementById('sort-dropdown-wrapper');
    const menu    = document.getElementById('sort-dropdown-menu');
    if (!wrapper || !menu) return;
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) {
        menu.classList.add('hidden');
        wrapper.classList.remove('open');
    } else {
        menu.classList.remove('hidden');
        wrapper.classList.add('open');
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', _closeSortDropdown, { once: true });
        }, 0);
    }
}

function _closeSortDropdown() {
    const menu    = document.getElementById('sort-dropdown-menu');
    const wrapper = document.getElementById('sort-dropdown-wrapper');
    if (menu)    menu.classList.add('hidden');
    if (wrapper) wrapper.classList.remove('open');
}

function selectSortOption(el, label) {
    // Update active state
    document.querySelectorAll('.custom-select-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    // Update button label
    const labelEl = document.getElementById('sort-selected-label');
    if (labelEl) labelEl.textContent = label;
    // Sync to hidden select
    const realSelect = document.getElementById('budget-sort-select');
    if (realSelect) realSelect.value = el.dataset.value;
    // Close dropdown
    _closeSortDropdown();
    // Re-apply filter/sort
    applyBudgetFilter();
}

function setBudgetFilter(filter, tabEl) {
    _budgetFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');
    applyBudgetFilter();
}

function applyBudgetFilter() {
    const gridEl = document.getElementById('budget-feature-grid');
    if (!gridEl) return;

    // Sort
    const sortVal = document.getElementById('budget-sort-select')?.value ?? 'name-asc';
    let list = [..._budgetCache];
    if (sortVal === 'name-asc')       list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortVal === 'balance-desc') list.sort((a, b) => b._displayBalance - a._displayBalance);
    else if (sortVal === 'balance-asc')  list.sort((a, b) => a._displayBalance - b._displayBalance);
    else if (sortVal === 'members-desc') list.sort((a, b) => (b.members?.length ?? 0) - (a.members?.length ?? 0));

    // Filter
    if (_budgetFilter === 'active')   list = list.filter(b => b._isActive);
    if (_budgetFilter === 'inactive') list = list.filter(b => !b._isActive);

    gridEl.innerHTML = '';
    if (list.length === 0) {
        gridEl.innerHTML = '<div class="empty-state"><p>Không có quỹ nào phù hợp.</p></div>';
        return;
    }

    for (const budget of list) {
        const isActive = budget._isActive;
        const statusClass  = isActive ? 'status-active'   : 'status-inactive';
        const statusLabel  = isActive ? 'Hoạt động'         : 'Không hoạt động';
        const statusDot    = isActive ? '#00ffcc'          : '#888';

        const card = document.createElement('div');
        card.className = 'dash-card budget-feature-card';
        card.onclick = () => openBudgetDashboard(budget.id);
        card.innerHTML = `
            <div class="bfc-top">
              <div class="bfc-info">
                <div class="bfc-name">${budget.name}</div>
                <div class="bfc-meta">${budget.type}</div>
              </div>
              <div class="bfc-badges">
                <span class="bfc-status ${statusClass}">
                  <span style="width:6px;height:6px;border-radius:50%;background:${statusDot};display:inline-block;"></span>
                  ${statusLabel}
                </span>
                <button class="btn-delete-budget" onclick="event.stopPropagation(); handleDeleteBudgetById('${budget.id}')" title="Xóa quỹ">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            <div class="bfc-balance">
              <span class="bfc-amount">${budget._displayBalance.toFixed(4)}</span>
              <span class="bfc-currency">ETH</span>
            </div>
            <div class="bfc-footer">
              <div class="bfc-members">
                ${(budget.members ?? []).slice(0, 4).map(m => `<div class="mini-avatar" title="${m.name}">${m.avatar ?? m.name?.charAt(0) ?? '?'}</div>`).join('')}
                ${(budget.members?.length ?? 0) > 4 ? `<div class="mini-avatar more">+${budget.members.length - 4}</div>` : ''}
              </div>
              <span class="bfc-member-count">${budget.members?.length ?? 0} thành viên</span>
            </div>
        `;
        gridEl.appendChild(card);
    }
}

function openCreateBudgetModal() {
    document.getElementById('create-budget-modal').classList.remove('hidden');
}

async function handleCreateBudget(event) {
    event.preventDefault();
    const name = document.getElementById('budget-name').value;
    const description = document.getElementById('create-budget-description').value;
    let type = document.getElementById('create-budget-type').value;
    if (type === 'Khác') {
        const otherType = document.getElementById('budget-type-other').value.trim();
        if (otherType) type = otherType;
    }
    const budgetData = {
        name, description, type,
        members: [{ name: currentMemberProfile ? currentMemberProfile.name : 'Quản trị viên', address: connectedAddress, role: 'Owner', avatar: currentMemberProfile ? currentMemberProfile.name.charAt(0).toUpperCase() : 'A' }],
        rules: [], transactions: []
    };
    const result = await createBudget(budgetData);
    if (result) {
        closeModal('create-budget-modal');
        document.getElementById('create-budget-form').reset();
        document.getElementById('budget-type-other-container').classList.add('hidden');
        
        // Reset visual selector to "Cá nhân"
        const personalItem = document.querySelector('.type-select-item[onclick*="Cá nhân"]');
        if (personalItem) selectBudgetType('Cá nhân', personalItem);
        
        if (currentStep === 'budget-management') renderBudgetManagement();
    }
}

async function createBudget(budgetData) {
    if (!connectedAddress) { showToast('error', 'Vui lòng kết nối ví trước!'); return; }
    showLoading('Đang kiểm tra mạng lưới...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }
        updateLoadingText('Đang khởi tạo giao dịch trên Blockchain...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const factoryContract = new ethers.Contract(VAULT_FACTORY_ADDRESS, WALLET_FACTORY_ABI, signer);
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
                if (parsedLog && parsedLog.name === 'FundCreated') { vaultAddress = parsedLog.args.fundAddress || parsedLog.args[0]; break; }
            } catch (e) { /* Skip */ }
        }
        if (!vaultAddress) throw new Error('Đã tạo thành công nhưng không tìm thấy địa chỉ Vault trong log.');

        console.log('Smart Vault deployed at:', vaultAddress);
        updateLoadingText('Lưu thông tin vào hệ thống...');

        let gasFee = 0;
        try { const feeWei = receipt.gasUsed * receipt.gasPrice; gasFee = parseFloat(ethers.formatEther(feeWei)); } catch (e) { console.error('Error calculating gas fee:', e); }

        const response = await fetch(`${API_BASE_URL}/budgets/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...budgetData, creator_address: connectedAddress, vault_address: vaultAddress, tx_hash: receipt.hash, gas_fee: gasFee }),
        });
        const result = await response.json();
        if (!response.ok) {
            const errorMsg = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail);
            throw new Error(errorMsg || 'Lỗi từ server');
        }
        hideLoading();
        showToast('success', 'Tạo quỹ và Smart Vault thành công!');
        renderMainTransactions();
        return result;
    } catch (error) {
        hideLoading();
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') errorMsg = 'Bạn đã từ chối giao dịch trên MetaMask.';
        showToast('error', 'Lỗi khi tạo quỹ: ' + errorMsg);
        console.error('Create Budget Error:', error);
    }
}

async function handleDeleteBudget() {
    if (!currentBudgetId) return;
    const confirmed = confirm('Bạn có chắc chắn muốn xóa quỹ này không? Hành động này không thể hoàn tác.');
    if (!confirmed) return;
    showLoading('Đang xóa quỹ...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}?address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã xóa quỹ thành công!'); currentBudgetId = null; goToBudgetManagement(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Không thể xóa quỹ'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

async function handleDeleteBudgetById(budgetId) {
    if (!budgetId) return;
    const confirmed = confirm('Bạn có chắc chắn muốn xóa quỹ này không?');
    if (!confirmed) return;
    showLoading('Đang xóa quỹ...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${budgetId}?address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã xóa quỹ thành công!'); renderBudgetManagement(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Không thể xóa quỹ'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

function openJoinBudgetModal() {
    document.getElementById('join-budget-modal').classList.remove('hidden');
}

async function handleJoinBudget(event) {
    event.preventDefault();
    const budgetId = document.getElementById('join-budget-id').value.trim();
    if (!budgetId) { showToast('error', 'Vui lòng nhập mã ID của quỹ!'); return; }
    if (!connectedAddress) { showToast('error', 'Vui lòng kết nối ví MetaMask!'); return; }
    showLoading('Đang gửi yêu cầu tham gia...');
    try {
        let memberName = 'Thành viên mới';
        try {
            const memberResponse = await fetch(`${API_BASE_URL}/members/?address=${connectedAddress}`);
            if (memberResponse.ok) { const memberData = await memberResponse.json(); memberName = memberData.name; }
        } catch (e) { console.log('Using default name as member profile not found'); }
        const memberData = { name: memberName, address: connectedAddress, role: 'Thành viên', avatar: memberName.charAt(0).toUpperCase() };
        const response = await fetch(`${API_BASE_URL}/budgets/${budgetId}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) });
        if (response.ok) {
            showToast('success', 'Bạn đã tham gia quỹ thành công!');
            closeModal('join-budget-modal');
            document.getElementById('join-budget-form').reset();
            if (currentStep === 'budget-management') renderBudgetManagement(); else renderBudgets();
        } else { const err = await response.json(); throw new Error(err.detail || 'Không tìm thấy quỹ với ID này hoặc bạn đã là thành viên.'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

function copyBudgetId() {
    const budgetId = document.getElementById('budget-id-display').textContent;
    if (budgetId && budgetId !== '---') {
        navigator.clipboard.writeText(budgetId).then(() => showToast('success', 'Đã sao chép mã ID quỹ!')).catch(() => showToast('error', 'Không thể sao chép mã ID'));
    }
}

function copyVaultAddress() {
    const vaultAddress = document.getElementById('budget-vault-address').textContent;
    if (vaultAddress && vaultAddress !== '0x...' && vaultAddress !== 'N/A') {
        navigator.clipboard.writeText(vaultAddress).then(() => showToast('success', 'Đã sao chép địa chỉ Vault!')).catch(() => showToast('error', 'Không thể sao chép địa chỉ Vault'));
    }
}

function toggleUtilitiesDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('utilities-dropdown');
    const chevron = document.querySelector('.utilities-chevron');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    if (chevron) chevron.style.transform = isHidden ? 'rotate(180deg)' : '';
    if (isHidden) {
        // Đóng khi click ra ngoài
        setTimeout(() => {
            document.addEventListener('click', closeUtilitiesDropdownOutside, { once: true });
        }, 0);
    }
}

function closeUtilitiesDropdownOutside(e) {
    const wrapper = document.querySelector('.utilities-dropdown-wrapper');
    if (wrapper && !wrapper.contains(e.target)) closeUtilitiesDropdown();
}

function closeUtilitiesDropdown() {
    const dropdown = document.getElementById('utilities-dropdown');
    const chevron = document.querySelector('.utilities-chevron');
    if (dropdown) dropdown.classList.add('hidden');
    if (chevron) chevron.style.transform = '';
}

function selectBudgetType(type, element) {
    // Cập nhật giá trị vào hidden input
    document.getElementById('create-budget-type').value = type;
    
    // Cập nhật giao diện (active state)
    document.querySelectorAll('.type-select-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    
    // Xử lý hiện/ẩn input "Khác"
    const otherContainer = document.getElementById('budget-type-other-container');
    if (type === 'Khác') {
        otherContainer.classList.remove('hidden');
        document.getElementById('budget-type-other').focus();
    } else {
        otherContainer.classList.add('hidden');
    }
}
