/* ========================================
   Budget Manager - Main Entry Point
   Khởi tạo và điều phối các module
   ======================================== */

document.addEventListener('DOMContentLoaded', async () => {
    checkMetaMaskInstalled();
    listenForAccountChanges();

    // Thử tự động kết nối nếu đã có quyền truy cập
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                console.log('Found existing connection:', accounts[0]);
                connectedAddress = accounts[0];
                connectedChainId = await window.ethereum.request({ method: 'eth_chainId' });
                updateWalletUI();
                handleContinue(); // Tự động kiểm tra và vào dashboard
            }
        } catch (err) {
            console.error('Error auto-connecting:', err);
        }
    }

    // Thêm listener cho loại quỹ "Khác"
    const budgetTypeSelect = document.getElementById('create-budget-type');
    const budgetTypeOtherContainer = document.getElementById('budget-type-other-container');

    if (budgetTypeSelect && budgetTypeOtherContainer) {
        budgetTypeSelect.addEventListener('change', (e) => {
            console.log('Budget type changed to:', e.target.value);
            if (e.target.value === 'Khác') {
                budgetTypeOtherContainer.classList.remove('hidden');
                document.getElementById('budget-type-other').focus();
            } else {
                budgetTypeOtherContainer.classList.add('hidden');
            }
        });
    }

    // Thêm listener kiểm tra địa chỉ ví khi nhập (cho Modal Thêm thành viên)
    const newMemberAddressInput = document.getElementById('new-member-address');
    if (newMemberAddressInput) {
        newMemberAddressInput.addEventListener('input', async (e) => {
            const address = e.target.value.trim();
            const statusEl = document.getElementById('address-check-status');
            if (!statusEl) return;

            if (address.length === 42 && address.startsWith('0x')) {
                statusEl.textContent = '🔍 Đang kiểm tra người dùng...';
                statusEl.style.color = 'var(--text-secondary)';
                try {
                    const response = await fetch(`${API_BASE_URL}/members/?address=${address}`);
                    if (response.ok) {
                        const data = await response.json();
                        statusEl.textContent = `Tìm thấy: ${data.name}`;
                        statusEl.style.color = '#10b981';
                    } else {
                        statusEl.textContent = 'Người dùng chưa đăng ký hệ thống';
                        statusEl.style.color = '#f59e0b';
                    }
                } catch (err) {
                    statusEl.textContent = '';
                }
            } else {
                statusEl.textContent = '';
            }
        });
    }
});
