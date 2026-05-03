/* ========================================
   Quản lý Thành viên (Members)
   ======================================== */

function openAddMemberModal() {
    document.getElementById('add-member-modal').classList.remove('hidden');
}

async function handleAddMember(event) {
    event.preventDefault();
    const address = document.getElementById('new-member-address').value.trim();
    const role = document.getElementById('new-member-role').value;
    if (!address.startsWith('0x') || address.length !== 42) { showToast('error', 'Địa chỉ ví không hợp lệ!'); return; }
    showLoading('Đang chuẩn bị yêu cầu...');
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget) throw new Error('Không tìm thấy quỹ');

        if (!budget.vault_address) {
            const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/add-member-by-address`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, role }) });
            if (response.ok) { showToast('success', 'Đã thêm thành viên thành công!'); closeModal('add-member-modal'); openBudgetDashboard(currentBudgetId); }
            else { const err = await response.json(); throw new Error(err.detail || 'Lỗi khi thêm thành viên'); }
            return;
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const newTotalMembers = budget.members.length + 1;
        const newThreshold = Math.floor(newTotalMembers / 2) + 1;
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        const types = { AddMemberRequest: [{ name: "newMember", type: "address" }, { name: "newThreshold", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
        const value = { newMember: address, newThreshold: BigInt(newThreshold), nonce: BigInt(nonce), deadline: BigInt(deadline) };

        updateLoadingText('Vui lòng ký yêu cầu thêm thành viên...');
        const signature = await signer.signTypedData(domain, types, value);
        updateLoadingText('Đang gửi đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budget_id: currentBudgetId, type: "ADD_MEMBER", target_address: address, proposer_address: connectedAddress, nonce, deadline, signature, new_threshold: newThreshold })
        });
        if (response.ok) { showToast('success', 'Đã tạo đề xuất thêm thành viên thành công!'); closeModal('add-member-modal'); fetchAndRenderPendingProposals(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Lỗi khi tạo đề xuất'); }
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
}

async function handleRemoveMember(address) {
    if (!currentBudgetId || !address) return;
    const confirmed = confirm('Bạn có chắc chắn muốn xóa thành viên này khỏi quỹ?');
    if (!confirmed) return;
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget) throw new Error('Không tìm thấy dữ liệu quỹ');

        if (!budget.vault_address) {
            showLoading('Đang xóa thành viên...');
            const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/members/${address}?operator_address=${connectedAddress}`, { method: 'DELETE' });
            if (response.ok) { showToast('success', 'Đã xóa thành viên khỏi quỹ!'); openBudgetDashboard(currentBudgetId); }
            else { const err = await response.json(); throw new Error(err.detail || 'Không thể xóa thành viên'); }
            return;
        }

        showLoading('Đang khởi tạo đề xuất xóa thành viên...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const newTotalMembers = budget.members.length - 1;
        const newThreshold = Math.floor(newTotalMembers / 2) + 1;
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        const types = { RemoveMemberRequest: [{ name: "oldMember", type: "address" }, { name: "newThreshold", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
        const value = { oldMember: address, newThreshold: BigInt(newThreshold), nonce: BigInt(nonce), deadline: BigInt(deadline) };
        const signature = await signer.signTypedData(domain, types, value);

        updateLoadingText('Đang gửi đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budget_id: currentBudgetId, type: 'REMOVE_MEMBER', target_address: address, proposer_address: connectedAddress, nonce, deadline, signature, new_threshold: parseInt(newThreshold) })
        });
        if (response.ok) { showToast('success', 'Đã tạo đề xuất xóa thành viên thành công!'); fetchAndRenderPendingProposals(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Lỗi khi tạo đề xuất'); }
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
}

// ========== Danh sách thành viên hệ thống ==========
let currentMemberTargetInputId = 'new-member-address'; // Mặc định

async function openSystemMembersModal(targetId) {
    if (targetId) currentMemberTargetInputId = targetId;
    
    document.getElementById('system-members-modal').classList.remove('hidden');
    const listEl = document.getElementById('system-members-list');
    listEl.innerHTML = '<div class="empty-state"><p>Đang tải danh sách thành viên...</p></div>';
    try {
        const response = await fetch(`${API_BASE_URL}/members/all`);
        if (response.ok) { 
            allSystemMembers = await response.json(); 
            renderSystemMembers(allSystemMembers); 
        }
        else showToast('error', 'Không thể tải danh sách thành viên');
    } catch (err) { console.error(err); showToast('error', 'Lỗi kết nối server'); }
}

function renderSystemMembers(members) {
    const listEl = document.getElementById('system-members-list');
    if (!listEl) return;
    if (members.length === 0) { listEl.innerHTML = '<div class="empty-state"><p>Không tìm thấy thành viên nào</p></div>'; return; }
    listEl.innerHTML = '';
    members.forEach(member => {
        const div = document.createElement('div');
        div.className = 'member-item';
        div.style.cssText = 'cursor:pointer;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;transition:0.2s;display:flex;align-items:center;gap:12px;margin-bottom:8px;';
        div.onclick = () => selectMemberFromDirectory(member);
        div.onmouseover = () => div.style.background = 'rgba(255, 255, 255, 0.08)';
        div.onmouseout = () => div.style.background = 'rgba(255, 255, 255, 0.03)';
        div.innerHTML = `
            <div class="member-avatar" style="width:40px;height:40px;background:var(--purple-primary);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">${member.name.charAt(0).toUpperCase()}</div>
            <div class="member-details" style="display:flex;flex-direction:column;">
                <span class="member-name" style="font-weight:600;color:var(--text-primary);">${member.name}</span>
                <span class="member-address" style="font-size:11px;color:var(--text-secondary);opacity:0.7;">${shortenAddress(member.member_address)}</span>
            </div>
            <div class="select-indicator" style="margin-left:auto;color:var(--purple-primary);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </div>
        `;
        listEl.appendChild(div);
    });
}

function filterSystemMembers() {
    const query = document.getElementById('member-search-input').value.toLowerCase();
    const filtered = allSystemMembers.filter(m => m.name.toLowerCase().includes(query) || m.member_address.toLowerCase().includes(query));
    renderSystemMembers(filtered);
}

function selectMemberFromDirectory(member) {
    const addressInput = document.getElementById(currentMemberTargetInputId);
    if (addressInput) {
        addressInput.value = member.member_address;
        const event = new Event('input', { bubbles: true });
        addressInput.dispatchEvent(event);
    }
    closeModal('system-members-modal');
}
