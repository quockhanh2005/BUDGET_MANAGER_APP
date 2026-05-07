/* ========================================
   Đề xuất & Phê duyệt (Proposals)
   ======================================== */

async function fetchAndRenderPendingProposals() {
    if (!currentBudgetId) return;
    try {
        const [withdrawRes, membershipRes, limitRes] = await Promise.all([
            fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`),
            fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`),
            fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/limit-proposals`)
        ]);

        const withdrawRequests = withdrawRes.ok ? await withdrawRes.json() : [];
        const membershipProposals = membershipRes.ok ? await membershipRes.json() : [];
        const limitProposals = limitRes.ok ? await limitRes.json() : [];

        renderPendingProposals(withdrawRequests, membershipProposals, limitProposals);
    } catch (e) { console.error(e); }
}

async function renderPendingProposals(withdrawRequests, membershipProposals, limitProposals = []) {
    const container = document.getElementById('pending-withdraw-container');
    const list = document.getElementById('pending-withdraw-list');
    if (!container || !list) return;

    const pendingWithdraw = withdrawRequests.filter(r => r.status === 'pending');
    const pendingMembership = membershipProposals.filter(r => r.status === 'pending');
    const pendingLimits = limitProposals.filter(r => r.status === 'pending');

    if (pendingWithdraw.length === 0 && pendingMembership.length === 0 && pendingLimits.length === 0) { 
        container.classList.add('hidden'); 
        return; 
    }

    container.classList.remove('hidden');
    list.innerHTML = '';
    
    const budgetList = await fetchBudgets();
    const budget = budgetList.find(b => b.id === currentBudgetId);
    const memberCount = budget?.members?.length || 1;

    // Render Rút tiền
    pendingWithdraw.forEach(req => {
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount >= (memberCount / 2 + 0.1); // Quá bán
        
        const card = createProposalCard({
            id: req.id, type: 'withdraw', title: req.title || `Rút ${req.amount} ETH`,
            subtitle: `Đến: ${shortenAddress(req.to)} | Số tiền: ${req.amount} ETH`,
            sigCount, totalMembers: memberCount, hasSigned, canExecute,
            onSign: () => handleApproveWithdraw(req.id), onExecute: () => handleExecuteWithdraw(req.id), onCancel: () => handleCancelWithdraw(req.id)
        });
        list.appendChild(card);
    });

    // Render Thành viên
    pendingMembership.forEach(req => {
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount >= (memberCount / 2 + 0.1);
        const typeLabel = req.type === 'ADD_MEMBER' ? 'Thêm' : 'Xóa';
        const card = createProposalCard({
            id: req.id, type: 'membership', title: `${typeLabel} thành viên`,
            subtitle: `Địa chỉ: ${shortenAddress(req.target_address)}`,
            sigCount, totalMembers: memberCount, hasSigned, canExecute,
            onSign: () => handleApproveMembershipProposal(req.id), onExecute: () => handleExecuteMembershipProposal(req.id), onCancel: () => handleCancelProposal(req.id)
        });
        list.appendChild(card);
    });

    // Render Hạn mức
    pendingLimits.forEach(req => {
        const hasSigned = req.signatures.some(s => s.signer_address.toLowerCase() === connectedAddress.toLowerCase());
        const sigCount = req.signatures.length;
        const canExecute = sigCount >= (memberCount / 2 + 0.1);
        const card = createProposalCard({
            id: req.id, type: 'limit', title: `Đặt hạn mức chi tiêu`,
            subtitle: `Hạng mục: ${getCategoryName(req.category_id)} | Ngưỡng: ${req.limit_amount} ETH`,
            sigCount, totalMembers: memberCount, hasSigned, canExecute,
            onSign: () => signLimitProposal(req.id, req.category_id, req.limit_amount, req.nonce, req.deadline), 
            onExecute: () => executeLimitProposal(req.id, req.category_id, req.limit_amount, req.nonce, req.deadline), 
            onCancel: () => handleCancelLimitProposal(req.id)
        });
        list.appendChild(card);
    });
}

function createProposalCard({ id, type, title, subtitle, sigCount, totalMembers, hasSigned, canExecute, onSign, onExecute, onCancel }) {
    const card = document.createElement('div');
    card.className = 'proposal-card';
    
    let accentColor = 'var(--warning)';
    let typeLabel = 'ĐỀ XUẤT';
    let icon = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>';

    if (type === 'withdraw') {
        accentColor = '#ff4d4d';
        typeLabel = 'RÚT TIỀN';
        icon = '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>';
    } else if (type === 'membership') {
        accentColor = '#00ffcc';
        typeLabel = 'THÀNH VIÊN';
        icon = '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>';
    } else if (type === 'limit') {
        accentColor = 'var(--accent-gold)';
        typeLabel = 'HẠN MỨC';
        icon = '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>';
    }

    card.innerHTML = `
        <div class="proposal-accent" style="background: ${accentColor};"></div>
        <div class="proposal-header">
            <div class="proposal-type" style="color: ${accentColor}; border-color: ${accentColor}44;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">${icon}</svg>
                ${typeLabel}
            </div>
            <div class="proposal-votes">
                <span class="votes-count">${sigCount}/${totalMembers}</span>
                <span class="votes-label">chữ ký</span>
            </div>
        </div>
        <div class="proposal-main">
            <h4 class="proposal-title">${title}</h4>
            <div class="proposal-subtitle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                ${subtitle}
            </div>
        </div>
        <div class="proposal-progress-bar">
            <div class="proposal-progress-fill" style="width: ${(sigCount/totalMembers)*100}%; background: ${accentColor}; color: ${accentColor};"></div>
        </div>
        <div class="proposal-actions">
            ${!hasSigned ? `
                <button class="btn-proposal btn-sign" id="sign-${id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Ký duyệt
                </button>
            ` : `
                <div class="signed-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    ĐÃ KÝ CỦA BẠN
                </div>
            `}
            
            ${canExecute ? `
                <button class="btn-proposal btn-execute" id="execute-${id}">
                    Thực thi
                </button>
            ` : ''}
            
            <button class="btn-cancel-proposal" id="cancel-${id}">HỦY</button>
        </div>
    `;

    if (!hasSigned) card.querySelector(`#sign-${id}`).onclick = onSign;
    if (canExecute) card.querySelector(`#execute-${id}`).onclick = onExecute;
    card.querySelector(`#cancel-${id}`).onclick = onCancel;

    return card;
}

async function handleApproveWithdraw(requestId) {
    showLoading('Đang kiểm tra quyền thành viên...');
    try {
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        
        // --- KIỂM TRA MEMBER TRÊN BLOCKCHAIN ---
        const vaultContractBase = new ethers.Contract(budget.vault_address, ["function isMember(address) view returns (bool)"], provider);
        const isRealMember = await vaultContractBase.isMember(address);
        
        if (!isRealMember) {
            throw new Error(`Ví của bạn (${shortenAddress(address)}) chưa được cập nhật làm thành viên của Quỹ này trên Blockchain. Vui lòng thực thi đề xuất "Thêm thành viên" trước.`);
        }

        updateLoadingText('Đang chuẩn bị bản tin ký...');
        const budgetResponse = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests`);
        const requests = await budgetResponse.json();
        const req = requests.find(r => r.id === requestId);
        
        const network = await provider.getNetwork();
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        
        const vaultCheckContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        let isLegacy = false;
        try { await vaultCheckContract.expenseManager(); } catch (e) { isLegacy = true; }

        let types, value;
        const amountWei = ethers.parseEther(req.amount.toString());

        if (isLegacy) {
            types = { WithdrawRequest: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            value = { to: req.to, amount: amountWei, nonce: BigInt(req.nonce), deadline: BigInt(req.deadline) };
        } else {
            types = { WithdrawRequest: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "categoryId", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
            value = { to: req.to, amount: amountWei, categoryId: BigInt(req.category_id || 0), nonce: BigInt(req.nonce), deadline: BigInt(req.deadline) };
        }

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        
        updateLoadingText('Đang gửi chữ ký lên hệ thống...');
        const signResponse = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/sign?address=${address}&signature=${signature}`, { method: 'POST' });
        
        if (signResponse.ok) {
            const data = await signResponse.json();
            const newSigCount = data.signatures.length;
            const threshold = budget.members.length / 2 + 0.1;

            if (newSigCount >= threshold) {
                showToast('success', 'Đã đủ chữ ký! Đang tự động thực thi rút tiền...');
                setTimeout(() => handleExecuteWithdraw(requestId), 1000);
            } else {
                showToast('success', `Đã ký thành công! (Hiện có ${newSigCount}/${budget.members.length} chữ ký)`);
                fetchAndRenderPendingProposals();
            }
        } else throw new Error('Lỗi khi lưu chữ ký vào hệ thống');
    } catch (error) { 
        showToast('error', error.message); 
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
        
        const vaultContractBase = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        let isLegacy = false;
        try { await vaultContractBase.expenseManager(); } catch (e) { isLegacy = true; }

        const abiToUse = isLegacy ? [
            "function executeWithdraw(address payable _to, uint256 _amount, uint256 _nonce, uint256 _deadline, bytes[] _signatures)",
            "function executedNonces(uint256) view returns (bool)"
        ] : [
            "function executeWithdraw(address payable _to, uint256 _amount, uint256 _categoryId, uint256 _nonce, uint256 _deadline, bytes[] _signatures)",
            "function executedNonces(uint256) view returns (bool)"
        ];
        
        const vaultContract = new ethers.Contract(budget.vault_address, abiToUse, signer);

        const isExecuted = await vaultContract.executedNonces(BigInt(req.nonce));
        if (isExecuted) throw new Error('Giao dịch đã được thực thi rồi.');

        const vaultBalance = await provider.getBalance(budget.vault_address);
        const amountWei = ethers.parseEther(req.amount.toString());
        if (vaultBalance < amountWei) throw new Error(`Số dư không đủ (Cần: ${req.amount} ETH, Hiện có: ${ethers.formatEther(vaultBalance)} ETH)`);

        const uniqueSignaturesMap = new Map();
        req.signatures.forEach(s => uniqueSignaturesMap.set(s.signer_address.toLowerCase(), s.signature));
        const sortedSignatures = Array.from(uniqueSignaturesMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(entry => entry[1]);
        
        updateLoadingText('Đang kiểm tra tính hợp lệ...');
        try {
            if (isLegacy) await vaultContract.executeWithdraw.staticCall(req.to, amountWei, BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
            else await vaultContract.executeWithdraw.staticCall(req.to, amountWei, BigInt(req.category_id || 0), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        } catch (staticError) {
            console.error('Execution Check Error:', staticError);
            let reason = 'Blockchain từ chối: ';
            if (staticError.reason) reason += staticError.reason;
            else if (staticError.message.includes('reverted')) {
                const match = staticError.message.match(/reverted with reason string ["'](.+)["']/);
                reason += match ? match[1] : 'Chữ ký không hợp lệ hoặc sai Member.';
            } else reason += 'Vui lòng kiểm tra lại danh sách Member trên chuỗi.';
            throw new Error(reason);
        }

        updateLoadingText('Đang gửi giao dịch...');
        let tx;
        if (isLegacy) tx = await vaultContract.executeWithdraw(req.to, amountWei, BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        else tx = await vaultContract.executeWithdraw(req.to, amountWei, BigInt(req.category_id || 0), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        
        const receipt = await tx.wait();
        await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}/executed?tx_hash=${receipt.hash}`, { method: 'POST' });
        showToast('success', 'Rút tiền thành công!');
        fetchAndRenderPendingProposals();
        if (typeof openBudgetDashboard === 'function') openBudgetDashboard(currentBudgetId);
    } catch (error) { 
        showToast('error', error.message); 
    } finally { hideLoading(); }
}

async function handleApproveMembershipProposal(proposalId) {
    showLoading('Đang chuẩn bị ký phê duyệt...');
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`);
        const proposals = await response.json();
        const req = proposals.find(p => p.id === proposalId);
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
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
        const signature = await signer.signTypedData(domain, types, value);
        const signResponse = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/approve`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voter_address: address, signature })
        });
        if (signResponse.ok) {
            const data = await signResponse.json();
            if (data.signatures.length >= (budget.members.length / 2 + 0.1)) {
                showToast('success', 'Đã đủ chữ ký! Tự động thực thi...');
                setTimeout(() => handleExecuteMembershipProposal(proposalId), 1000);
            } else {
                showToast('success', 'Đã phê duyệt!');
                fetchAndRenderPendingProposals();
            }
        } else throw new Error('Lỗi khi gửi chữ ký');
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

async function handleExecuteMembershipProposal(proposalId) {
    showLoading('Đang chuẩn bị thực thi...');
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${currentBudgetId}`);
        const proposals = await response.json();
        const req = proposals.find(p => p.id === proposalId);
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const sortedSignatures = [...req.signatures].sort((a, b) => a.signer_address.toLowerCase().localeCompare(b.signer_address.toLowerCase())).map(s => s.signature);
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);
        let tx;
        if (req.type === 'ADD_MEMBER') tx = await vaultContract.executeAddMember(req.target_address, BigInt(req.new_threshold), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        else tx = await vaultContract.executeRemoveMember(req.target_address, BigInt(req.new_threshold), BigInt(req.nonce), BigInt(req.deadline), sortedSignatures);
        await tx.wait();
        await fetch(`${API_BASE_URL}/proposals-management/${proposalId}/execute?tx_hash=${tx.hash}`, { method: 'POST' });
        showToast('success', 'Thành công! Danh sách thành viên đã cập nhật trên Blockchain.');
        fetchAndRenderPendingProposals();
        if (typeof openBudgetDashboard === 'function') openBudgetDashboard(currentBudgetId);
    } catch (error) { showToast('error', error.message); } finally { hideLoading(); }
}

async function handleCancelProposal(proposalId) {
    if (!confirm('Hủy đề xuất này?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/proposals-management/${proposalId}?operator_address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã hủy'); fetchAndRenderPendingProposals(); }
    } catch (error) { showToast('error', error.message); }
}

async function handleCancelWithdraw(requestId) {
    if (!confirm('Hủy yêu cầu rút tiền này?')) return;
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/withdraw-requests/${requestId}?operator_address=${connectedAddress}`, { method: 'DELETE' });
        if (response.ok) { showToast('success', 'Đã hủy'); fetchAndRenderPendingProposals(); }
    } catch (error) { showToast('error', error.message); }
}
