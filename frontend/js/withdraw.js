/* ========================================
   Rút Tiền (Withdraw)
   ======================================== */

async function openWithdrawModal() {
    if (!currentBudgetId) return;
    const budgetBalance = document.getElementById('budget-balance').textContent;
    document.getElementById('withdraw-budget-balance').textContent = budgetBalance;
    document.getElementById('withdraw-to').value = connectedAddress;
    document.getElementById('withdraw-modal').classList.remove('hidden');
    document.getElementById('withdraw-amount').focus();

    // Kiểm tra và hiển thị cảnh báo nếu là Vault cũ
    const budgetList = await fetchBudgets();
    const budget = budgetList.find(b => b.id === currentBudgetId);
    const categoryGroup = document.getElementById('withdraw-category').parentElement;
    
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        await vaultContract.expenseManager();
        categoryGroup.style.opacity = '1';
        categoryGroup.title = '';
    } catch (e) {
        // Vault cũ không hỗ trợ danh mục
        categoryGroup.style.opacity = '0.5';
        categoryGroup.title = 'Quỹ này không hỗ trợ phân loại danh mục chi tiêu.';
    }
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
    const categoryId = parseInt(document.getElementById('withdraw-category').value);
    
    if (!amount || parseFloat(amount) <= 0) { showToast('error', 'Số lượng rút không hợp lệ!'); return; }
    if (!to || !to.startsWith('0x') || to.length !== 42) { showToast('error', 'Địa chỉ người nhận không hợp lệ!'); return; }

    showLoading('Đang chuẩn bị bản tin ký...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget || !budget.vault_address) throw new Error('Không tìm thấy địa chỉ Vault của quỹ này!');

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();

        // --- KIỂM TRA PHIÊN BẢN VAULT ---
        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
        let isLegacy = false;
        try {
            await vaultContract.expenseManager();
        } catch (e) {
            isLegacy = true;
        }

        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const amountWei = ethers.parseEther(amount);
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        
        let types, value;
        if (isLegacy) {
            types = { 
                WithdrawRequest: [
                    { name: "to", type: "address" }, 
                    { name: "amount", type: "uint256" }, 
                    { name: "nonce", type: "uint256" }, 
                    { name: "deadline", type: "uint256" }
                ] 
            };
            value = { to, amount: amountWei, nonce: BigInt(nonce), deadline: BigInt(deadline) };
        } else {
            types = { 
                WithdrawRequest: [
                    { name: "to", type: "address" }, 
                    { name: "amount", type: "uint256" }, 
                    { name: "categoryId", type: "uint256" }, 
                    { name: "nonce", type: "uint256" }, 
                    { name: "deadline", type: "uint256" }
                ] 
            };
            value = { to, amount: amountWei, categoryId: BigInt(categoryId), nonce: BigInt(nonce), deadline: BigInt(deadline) };
        }

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        
        updateLoadingText('Đang lưu đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests?address=${connectedAddress}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title, to, amount: parseFloat(amount), 
                category_id: isLegacy ? 0 : categoryId, 
                nonce: Number(nonce), 
                deadline: Number(deadline), 
                signature 
            })
        });

        if (response.ok) {
            showToast('success', 'Đề xuất rút tiền đã được tạo thành công!');
            closeModal('withdraw-modal');
            document.getElementById('withdraw-form').reset();
            if (typeof fetchAndRenderPendingProposals === 'function') fetchAndRenderPendingProposals();
        } else { 
            const err = await response.json(); 
            throw new Error(err.detail || 'Lỗi khi lưu đề xuất rút tiền'); 
        }
    } catch (error) {
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') errorMsg = 'Bạn đã từ chối giao dịch.';
        else if (error.data && error.data.message) errorMsg = error.data.message;
        showToast('error', 'Lỗi rút tiền: ' + errorMsg);
        console.error('Withdraw Error:', error);
    } finally { hideLoading(); }
}
