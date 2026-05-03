/* ========================================
   Đề xuất & Phê duyệt (Proposals)
   ======================================== */

async function fetchAndRenderPendingProposals() {
    if (!currentBudgetId) return;
    try {
        const withdrawResponse = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`);
        const withdrawRequests = withdrawResponse.ok ? await withdrawResponse.json() : [];
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
    if (pendingWithdraw.length === 0 && pendingMembership.length === 0) { container.classList.add('hidden'); return; }

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

    pendingWithdraw.forEach(req => {
        const memberCount = budget.members.length;
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount > memberCount / 2;
        const card = createProposalCard({
            id: req.id, title: req.title || `Rút ${req.amount} ETH`,
            subtitle: `Đến: ${req.to.substring(0, 6)}...${req.to.substring(38)} | Số tiền: ${req.amount} ETH`,
            sigCount, totalMembers: memberCount, hasSigned, canExecute,
            onSign: () => handleApproveWithdraw(req.id), onExecute: () => handleExecuteWithdraw(req.id), onCancel: () => handleCancelWithdraw(req.id)
        });
        list.appendChild(card);
    });

    pendingMembership.forEach(req => {
        const memberCount = budget.members.length;
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount > memberCount / 2;
        const typeLabel = req.type === 'ADD_MEMBER' ? 'Thêm' : 'Xóa';
        const card = createProposalCard({
            id: req.id, title: `${typeLabel} thành viên`,
            subtitle: `Địa chỉ: ${req.target_address.substring(0, 6)}...${req.target_address.substring(38)}`,
            sigCount, totalMembers: memberCount, hasSigned, canExecute,
            onSign: () => handleApproveMembershipProposal(req.id), onExecute: () => handleExecuteMembershipProposal(req.id), onCancel: () => handleCancelProposal(req.id)
        });
        list.appendChild(card);
    });
}

function createProposalCard({ id, title, subtitle, sigCount, totalMembers, hasSigned, canExecute, onSign, onExecute, onCancel }) {
    const card = document.createElement('div');
    card.className = 'dashboard-card';
    card.style.cssText = 'padding:15px;border:1px solid var(--warning);background:rgba(255,152,0,0.05);margin-bottom:12px;border-radius:12px;';
    card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
                <div style="font-weight:700;color:var(--text-primary);font-size:16px;">${title}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${subtitle}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:12px;font-weight:700;color:var(--warning);">${sigCount}/${totalMembers} chữ ký</div>
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
            ${!hasSigned ? `<button class="btn btn-primary btn-sm sign-btn" style="flex:1;padding:6px;font-size:12px;background:var(--warning);border:none;">Ký phê duyệt</button>` : `<button class="btn btn-sm" disabled style="flex:1;padding:6px;font-size:12px;opacity:0.6;background:rgba(255,255,255,0.1);border:1px solid var(--border);">Đã ký</button>`}
            ${canExecute ? `<button class="btn btn-success btn-sm execute-btn" style="flex:1;padding:6px;font-size:12px;border:none;">Thực thi</button>` : ''}
            <button class="btn btn-sm cancel-btn" style="padding:6px;font-size:12px;background:rgba(255,82,82,0.1);color:#ff5252;border:1px solid #ff5252;">Hủy</button>
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
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        const types = { WithdrawRequest: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
        const value = { to: req.to, amount: ethers.parseUnits(req.amount.toString(), 18), nonce: BigInt(req.nonce), deadline: BigInt(req.deadline) };
        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        updateLoadingText('Đang cập nhật chữ ký...');
        const signResponse = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/sign?address=${connectedAddress}&signature=${signature}`, { method: 'POST' });
        if (signResponse.ok) {
            showToast('success', 'Đã phê duyệt đề xuất! Vui lòng chờ hệ thống kiểm tra và thực thi tự động...');
            setTimeout(() => { fetchAndRenderPendingProposals(); if (typeof openBudgetDashboard === 'function') openBudgetDashboard(currentBudgetId); }, 2000);
        } else { const err = await signResponse.json(); throw new Error(err.detail || 'Lỗi khi gửi chữ ký'); }
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
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
        const uniqueSignaturesMap = new Map();
        req.signatures.forEach(s => uniqueSignaturesMap.set(s.signer_address.toLowerCase(), s.signature));
        const sortedSignatures = Array.from(uniqueSignaturesMap.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).map(entry => entry[1]);
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);
        updateLoadingText('Đang gửi giao dịch lên Blockchain...');
        const tx = await vaultContract.executeWithdraw(req.to, ethers.parseUnits(req.amount.toString(), 18), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();
        await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/executed?tx_hash=${receipt.hash}`, { method: 'POST' });
        showToast('success', 'Tiền đã được rút thành công!');
        fetchAndRenderPendingProposals();
        refreshBalances();
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
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
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        const types = {};
        const value = { nonce: BigInt(req.nonce), deadline: BigInt(req.deadline), newThreshold: BigInt(req.new_threshold) };
        if (req.type === 'ADD_MEMBER') {
            types.AddMemberRequest = [{ name: "newMember", type: "address" }, { name: "newThreshold", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }];
            value.newMember = req.target_address;
        } else {
            types.RemoveMemberRequest = [{ name: "oldMember", type: "address" }, { name: "newThreshold", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }];
            value.oldMember = req.target_address;
        }
        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        updateLoadingText('Đang cập nhật chữ ký...');
        const signResponse = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/approve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voter_address: connectedAddress, signature })
        });
        if (signResponse.ok) {
            showToast('success', 'Đã phê duyệt đề xuất thành công! Hệ thống đang kiểm tra để thực thi tự động...');
            setTimeout(() => { fetchAndRenderPendingProposals(); if (typeof openBudgetDashboard === 'function') openBudgetDashboard(currentBudgetId); }, 2000);
        } else { const err = await signResponse.json(); throw new Error(err.detail || 'Lỗi khi gửi chữ ký'); }
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
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
        const sortedSignatures = [...req.signatures].sort((a, b) => a.signer_address.toLowerCase() < b.signer_address.toLowerCase() ? -1 : 1).map(s => s.signature);
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);
        updateLoadingText('Đang gửi giao dịch lên Blockchain...');
        let tx;
        if (req.type === 'ADD_MEMBER') tx = await vaultContract.executeAddMember(req.target_address, BigInt(req.new_threshold), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        else tx = await vaultContract.executeRemoveMember(req.target_address, BigInt(req.new_threshold), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();
        await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/execute?tx_hash=${receipt.hash}`, { method: 'POST' });
        showToast('success', 'Đề xuất đã được thực thi thành công!');
        fetchAndRenderPendingProposals();
        const budgetData = await (await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}`)).json();
        renderBudgetDashboard(budgetData);
    } catch (error) { showToast('error', error.message); console.error(error); } finally { hideLoading(); }
}

async function handleCancelProposal(proposalId) {
    if (!confirm('Bạn có chắc chắn muốn hủy đề xuất này?')) return;
    showLoading('Đang hủy đề xuất...');
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}?operator_address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã hủy đề xuất thành công'); fetchAndRenderPendingProposals(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Không thể hủy đề xuất'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

async function handleCancelWithdraw(requestId) {
    if (!confirm('Bạn có chắc chắn muốn hủy yêu cầu rút tiền này?')) return;
    showLoading('Đang hủy yêu cầu...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}?operator_address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã hủy yêu cầu rút tiền thành công'); fetchAndRenderPendingProposals(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Không thể hủy yêu cầu'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

function openChangeThresholdModal() {
    openModal('change-threshold-modal');
}

async function handleChangeThreshold(event) {
    event.preventDefault();
    const newThreshold = document.getElementById('new-threshold-input').value;
    if (!newThreshold || newThreshold < 1) { showToast('error', 'Ngưỡng phê duyệt không hợp lệ'); return; }
    showLoading('Đang khởi tạo đề xuất thay đổi ngưỡng...');
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const domain = { name: "SharedVault", version: "1", chainId: (await provider.getNetwork()).chainId, verifyingContract: budget.vault_address };
        const types = { AddMemberRequest: [{ name: "newMember", type: "address" }, { name: "newThreshold", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
        const value = { newMember: connectedAddress, newThreshold: BigInt(newThreshold), nonce: BigInt(nonce), deadline: BigInt(deadline) };
        const signature = await signer.signTypedData(domain, types, value);
        const response = await fetch(`${API_BASE_URL}/proposals-management/create-membership`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budget_id: currentBudgetId, type: 'ADD_MEMBER', target_address: connectedAddress, proposer_address: connectedAddress, new_threshold: parseInt(newThreshold), nonce, deadline, signature })
        });
        if (response.ok) { showToast('success', 'Đề xuất thay đổi ngưỡng đã được tạo!'); closeModal('change-threshold-modal'); fetchAndRenderPendingProposals(); }
        else { const err = await response.json(); throw new Error(err.detail || 'Lỗi khi tạo đề xuất'); }
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}
