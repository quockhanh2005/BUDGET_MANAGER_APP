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

        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
        const amountWei = ethers.parseEther(amount);
        const domain = { name: "SharedVault", version: "1", chainId: network.chainId, verifyingContract: budget.vault_address };
        const types = { WithdrawRequest: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] };
        const value = { to, amount: amountWei, nonce: BigInt(nonce), deadline: BigInt(deadline) };

        updateLoadingText('Vui lòng ký xác nhận trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        console.log('Signature created:', signature);

        updateLoadingText('Đang lưu đề xuất lên hệ thống...');
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/withdraw-requests?address=${connectedAddress}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, to, amount: parseFloat(amount), nonce: Number(nonce), deadline: Number(deadline), signature })
        });

        if (response.ok) {
            showToast('success', 'Đề xuất rút tiền đã được tạo thành công!');
            closeModal('withdraw-modal');
            document.getElementById('withdraw-form').reset();
            fetchAndRenderPendingProposals();
        } else { const err = await response.json(); throw new Error(err.detail || 'Lỗi khi lưu đề xuất rút tiền'); }
    } catch (error) {
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') errorMsg = 'Bạn đã từ chối giao dịch.';
        else if (error.data && error.data.message) errorMsg = error.data.message;
        showToast('error', 'Lỗi rút tiền: ' + errorMsg);
        console.error('Withdraw Error:', error);
    } finally { hideLoading(); }
}
