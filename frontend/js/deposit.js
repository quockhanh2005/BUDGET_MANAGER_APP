/* ========================================
   Nạp Tiền (Deposit)
   ======================================== */

async function openDepositModal() {
    if (!currentBudgetId) { showToast('error', 'Chưa chọn quỹ nào!'); return; }
    const balanceEth = await getOnChainBalance(connectedAddress);
    document.getElementById('deposit-wallet-balance').textContent = parseFloat(balanceEth).toFixed(4);
    document.getElementById('deposit-amount').value = '';
    document.getElementById('deposit-modal').classList.remove('hidden');
    document.getElementById('deposit-amount').focus();
}

async function handleDeposit(event) {
    event.preventDefault();
    const amount = document.getElementById('deposit-amount').value;
    if (!amount || parseFloat(amount) <= 0) { showToast('error', 'Số lượng nạp không hợp lệ!'); return; }

    showLoading('Đang khởi tạo giao dịch nạp tiền...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget || !budget.vault_address) throw new Error('Không tìm thấy địa chỉ Vault của quỹ này!');

        updateLoadingText('Đang chờ xác nhận từ MetaMask...');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const tx = await signer.sendTransaction({
            to: budget.vault_address,
            value: ethers.parseEther(amount)
        });

        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();

        let gasFee = 0;
        try {
            const feeWei = receipt.gasUsed * receipt.gasPrice;
            gasFee = parseFloat(ethers.formatEther(feeWei));
        } catch (e) { console.error('Gas fee calc error:', e); }

        updateLoadingText('Đồng bộ dữ liệu hệ thống...');
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/deposit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: parseFloat(amount),
                tx_hash: receipt.hash,
                sender_address: connectedAddress,
                gas_fee: gasFee
            })
        });

        if (response.ok) {
            hideLoading();
            closeModal('deposit-modal');
            showToast('success', `Nạp thành công ${parseFloat(amount).toFixed(4)} ETH vào quỹ!`);
            // Refresh budget dashboard with updated balance + history
            renderMainTransactions();
            await openBudgetDashboard(currentBudgetId);
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi đồng bộ dữ liệu nạp tiền');
        }
    } catch (error) {
        hideLoading();
        let errorMsg = error.message;
        if (error.code === 'ACTION_REJECTED') errorMsg = 'Bạn đã từ chối giao dịch trên MetaMask.';
        showToast('error', 'Nạp tiền thất bại: ' + errorMsg);
        console.error('Deposit Error:', error);
    }
}
