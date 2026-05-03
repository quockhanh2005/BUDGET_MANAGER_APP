/**
 * Xử lý chuyển tiền cá nhân (Personal Wallet Transfer)
 */

async function openTransferModal() {
    if (!connectedAddress) {
        showToast('error', 'Vui lòng kết nối ví trước.');
        return;
    }

    // Cập nhật số dư hiện tại vào modal
    const balance = await getOnChainBalance(connectedAddress);
    document.getElementById('transfer-wallet-balance').textContent = parseFloat(balance).toFixed(4);
    
    // Reset form
    document.getElementById('transfer-form').reset();
    
    openModal('transfer-modal');
}

async function handleTransfer(event) {
    event.preventDefault();
    
    const toAddress = document.getElementById('transfer-to').value.trim();
    const amount = document.getElementById('transfer-amount').value;
    const title = document.getElementById('transfer-title').value.trim();
    
    if (!ethers.isAddress(toAddress)) {
        showToast('error', 'Địa chỉ ví người nhận không hợp lệ.');
        return;
    }
    
    if (toAddress.toLowerCase() === connectedAddress.toLowerCase()) {
        showToast('error', 'Không thể chuyển tiền cho chính mình.');
        return;
    }

    const btn = document.getElementById('btn-confirm-transfer');
    const originalText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Đang xử lý...';
        
        showLoading('Đang gửi giao dịch tới MetaMask...');
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Gửi giao dịch
        const tx = await signer.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(amount)
        });
        
        updateLoadingText('Giao dịch đã gửi. Đang chờ xác nhận...');
        showToast('info', 'Giao dịch đã được gửi lên mạng lưới.');
        
        // Chờ xác nhận
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            showToast('success', 'Chuyển tiền thành công!');
            
            const gasFee = parseFloat(ethers.formatEther(receipt.gasUsed * receipt.gasPrice));
            const totalOut = -(parseFloat(amount) + gasFee);
            
            // Đánh dấu đây là thay đổi số dư đã biết
            expectedBalanceChanges.push({ amount: totalOut, timestamp: Date.now() });

            // Log giao dịch về backend cho CẢ HAI bên (Người gửi và Người nhận)
            await logTransferToBackend({
                from_address: connectedAddress,
                to_address: toAddress,
                title: title || 'Chuyển tiền cá nhân',
                amount: parseFloat(amount),
                hash: tx.hash,
                gas_fee: gasFee
            });
            
            closeModal('transfer-modal');
            
            // Làm mới số dư và lịch sử
            refreshBalances();
            renderMainTransactions();
        } else {
            throw new Error('Giao dịch thất bại trên Blockchain.');
        }
        
    } catch (error) {
        console.error('Transfer error:', error);
        if (error.code === 'ACTION_REJECTED') {
            showToast('error', 'Bạn đã từ chối giao dịch.');
        } else {
            showToast('error', error.message || 'Có lỗi xảy ra khi chuyển tiền.');
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
        hideLoading();
    }
}

/**
 * Gửi log giao dịch chuyển tiền cho cả hai phía về backend
 */
async function logTransferToBackend(transferData) {
    try {
        const response = await fetch(`${API_BASE_URL}/wallet/transfer-log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transferData)
        });
        
        if (!response.ok) {
            console.error('Failed to log transfer to backend');
        }
    } catch (err) {
        console.error('Error logging transfer:', err);
    }
}
