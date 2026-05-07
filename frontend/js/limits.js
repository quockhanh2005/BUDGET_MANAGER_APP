/* ========================================
   Quản lý Ngưỡng Chi Tiêu (Spending Management)
   ======================================== */

console.log('limits.js loaded');

async function activateExpenseManager(vaultAddress) {
    console.log('Activating EM for:', vaultAddress);
    if (typeof showLoading === 'function') showLoading('Đang kích hoạt Expense Manager...');
    try {
        if (typeof ensureSepoliaNetwork !== 'function') {
            throw new Error('Hệ thống chưa sẵn sàng (vui lòng reload)');
        }
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { if (typeof hideLoading === 'function') hideLoading(); return; }

        if (typeof ethers === 'undefined') {
            throw new Error('Thư viện Ethers chưa được tải!');
        }
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        const EXPENSE_MANAGER_ADDRESS = "0x436343FdC432fdC633e765CCD897a4CD0B54907D";
        
        if (typeof SHARED_VAULT_ABI === 'undefined') {
            throw new Error('ABI chưa được tải!');
        }
        const vaultContract = new ethers.Contract(vaultAddress, SHARED_VAULT_ABI, signer);
        if (typeof updateLoadingText === 'function') updateLoadingText('Đang gửi giao dịch kích hoạt...');
        
        const tx = await vaultContract.setExpenseManager(EXPENSE_MANAGER_ADDRESS);
        
        if (typeof updateLoadingText === 'function') updateLoadingText('Đang chờ xác nhận từ Blockchain (30s)...');
        await tx.wait();
        
        if (typeof showToast === 'function') showToast('success', 'Kích hoạt hệ thống hạn mức thành công! Giờ bạn có thể tạo đề xuất.');
        renderCurrentCategoryLimits();
    } catch (error) {
        console.error('Activation error:', error);
        if (typeof showToast === 'function') showToast('error', 'Lỗi kích hoạt: ' + error.message);
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

async function openSetLimitModal() {
    if (!currentBudgetId) return;
    openModal('set-limit-modal');
    renderCurrentCategoryLimits();
}

async function renderCurrentCategoryLimits() {
    const listEl = document.getElementById('current-limits-list');
    if (!listEl) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/limits`);
        if (!response.ok) throw new Error("Không thể tải thông tin hạn mức");
        
        const limits = await response.json();
        listEl.innerHTML = '';
        
        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        let isEmMissing = false;
        let isLegacyVault = false;
        
        if (budget?.vault_address) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, provider);
            
            try {
                const emAddress = await vaultContract.expenseManager();
                if (emAddress === ethers.ZeroAddress || emAddress === '0x0000000000000000000000000000000000000000') {
                    isEmMissing = true;
                }
            } catch (e) {
                console.warn("Vault does not support ExpenseManager (Legacy mode):", e);
                isLegacyVault = true;
            }
        }

        if (isLegacyVault) {
            listEl.innerHTML = `
                <div style="grid-column: span 2; background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.2); border-radius: 12px; padding: 20px; text-align: center;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🛡️</div>
                    <h4 style="color: #ffa500; margin-bottom: 8px; font-size: 14px;">CHẾ ĐỘ QUẢN LÝ CƠ BẢN</h4>
                    <p style="color: var(--text-secondary); font-size: 12px; line-height: 1.6;">
                        Quỹ này sử dụng cơ chế bảo mật nguyên bản. <br>
                        Mọi giao dịch sẽ được quyết định trực tiếp qua chữ ký của các thành viên mà không cần kiểm tra hạn mức tự động.
                    </p>
                    <div style="margin-top: 15px; font-size: 11px; color: var(--text-muted);">
                        <i>Tính năng Hạn mức chi tiêu yêu cầu Quỹ phiên bản mới.</i>
                    </div>
                </div>
            `;
            // Disable form but keep modal useful
            document.getElementById('set-limit-form').style.opacity = '0.5';
            document.getElementById('set-limit-form').style.pointerEvents = 'none';
            return;
        }

        // Restore form for new vaults
        document.getElementById('set-limit-form').style.opacity = '1';
        document.getElementById('set-limit-form').style.pointerEvents = 'auto';

        if (isEmMissing) {
            const isOwner = budget.members.some(m => m.address.toLowerCase() === connectedAddress.toLowerCase() && m.role.toLowerCase() === 'owner');
            listEl.innerHTML = `
                <div style="grid-column: span 2; text-align: center; padding: 20px; background: rgba(255, 165, 0, 0.1); border-radius: 12px; border: 1px solid rgba(255, 165, 0, 0.3);">
                    <div style="color: #ffa500; font-weight: 700; margin-bottom: 10px;">⚠️ TÍNH NĂNG CHƯA KÍCH HOẠT</div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 15px;">
                        Hệ thống Expense Manager chưa được kết nối với Smart Vault này. Bạn cần kích hoạt để sử dụng tính năng hạn mức chi tiêu.
                    </p>
                    ${isOwner ? 
                        `<button class="btn btn-primary" onclick="activateExpenseManager('${budget.vault_address}')" style="background: #ffa500; color: #000; border: none;">Kích hoạt ngay</button>` : 
                        `<p style="font-size: 12px; font-style: italic;">Vui lòng liên hệ Owner của quỹ để kích hoạt tính năng này.</p>`
                    }
                </div>
            `;
            return;
        }

        const sortedIds = Object.keys(limits).sort((a, b) => parseInt(a) - parseInt(b));
        
        if (sortedIds.length === 0) {
            listEl.innerHTML = '<div style="grid-column: span 2; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">Chưa có hạn mức nào được thiết lập.</div>';
            return;
        }
        
        sortedIds.forEach(id => {
            const info = limits[id];
            const item = document.createElement('div');
            item.className = 'limit-item';
            item.style = 'background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px;';
            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; color: var(--text-primary);">${getCategoryName(id)}</span>
                    <span style="font-size: 0.75rem; color: ${info.is_active ? '#00ffcc' : '#888'};">${info.is_active ? '● Hoạt động' : '○ Tắt'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <span style="font-size: 1.1rem; font-weight: 700; color: var(--accent-gold);">${info.limit} <small style="font-size: 0.7rem;">ETH</small></span>
                    <span style="font-size: 0.75rem; color: var(--text-secondary);">Đã dùng: ${info.spent} ETH</span>
                </div>
                <div style="height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; margin-top: 4px;">
                    <div style="height: 100%; width: ${Math.min((info.spent/info.limit)*100, 100)}%; background: ${info.spent > info.limit ? '#ff4d4d' : 'var(--accent-gold)'};"></div>
                </div>
            `;
            listEl.appendChild(item);
        });
    } catch (err) {
        console.error('Error rendering limits:', err);
        listEl.innerHTML = `<div style="grid-column: span 2; color: #ff4d4d; text-align: center; font-size: 0.8rem;">Lỗi: ${err.message}</div>`;
    }
}

async function handleSetLimit(event) {
    event.preventDefault();
    if (!currentBudgetId) return;
    
    const categoryId = parseInt(document.getElementById('limit-category').value);
    const limitAmount = document.getElementById('limit-amount').value.trim();
    
    if (!limitAmount || parseFloat(limitAmount) <= 0) {
        showToast('error', 'Vui lòng nhập số tiền hợp lệ');
        return;
    }
    
    showLoading('Đang chuẩn bị đề xuất...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        if (!budget || !budget.vault_address) throw new Error('Không tìm thấy địa chỉ Vault');

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        
        const nonce = Date.now();
        const deadline = Math.floor(Date.now() / 1000) + (3600 * 24); // 24h
        
        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };
        
        const types = {
            SetCategoryLimitRequest: [
                { name: "categoryId", type: "uint256" },
                { name: "limitAmount", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };
        
        const limitAmountWei = ethers.parseEther(limitAmount);
        const value = {
            categoryId: BigInt(categoryId),
            limitAmount: limitAmountWei,
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };
        
        updateLoadingText('Vui lòng ký xác thực đề xuất trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        
        updateLoadingText('Đang lưu đề xuất...');
        const response = await fetch(`${API_BASE_URL}/budgets/${currentBudgetId}/limit-proposals?address=${connectedAddress}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                category_id: categoryId,
                limit_amount: parseFloat(limitAmount),
                nonce: nonce,
                deadline: deadline,
                signature: signature
            })
        });
        
        if (response.ok) {
            showToast('success', 'Đã tạo đề xuất đặt ngưỡng thành công!');
            closeModal('set-limit-modal');
            document.getElementById('set-limit-form').reset();
            // Nếu có hàm refresh dashboard thì gọi
            if (typeof openBudgetDashboard === 'function') openBudgetDashboard(currentBudgetId);
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi lưu đề xuất');
        }
    } catch (err) {
        console.error('Set limit error:', err);
        showToast('error', err.message);
    } finally {
        hideLoading();
    }
}

async function signLimitProposal(proposalId, categoryId, limitAmount, nonce, deadline) {
    if (!currentBudgetId) return;
    
    showLoading('Đang chuẩn bị ký...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const network = await provider.getNetwork();
        
        const domain = {
            name: "SharedVault",
            version: "1",
            chainId: network.chainId,
            verifyingContract: budget.vault_address
        };
        
        const types = {
            SetCategoryLimitRequest: [
                { name: "categoryId", type: "uint256" },
                { name: "limitAmount", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };
        
        const value = {
            categoryId: BigInt(categoryId),
            limitAmount: ethers.parseEther(limitAmount.toString()),
            nonce: BigInt(nonce),
            deadline: BigInt(deadline)
        };
        
        updateLoadingText('Vui lòng ký phê duyệt trên MetaMask...');
        const signature = await signer.signTypedData(domain, types, value);
        
        updateLoadingText('Đang cập nhật chữ ký...');
        const response = await fetch(`${API_BASE_URL}/budgets/limit-proposals/${proposalId}/sign?address=${connectedAddress}&signature=${signature}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            showToast('success', 'Đã ký phê duyệt thành công!');
            openBudgetDashboard(currentBudgetId);
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi lưu chữ ký');
        }
    } catch (err) {
        showToast('error', err.message);
    } finally {
        hideLoading();
    }
}

async function executeLimitProposal(proposalId, categoryId, limitAmount, nonce, deadline) {
    showLoading('Đang chuẩn bị thực thi...');
    try {
        const isCorrectNetwork = await ensureSepoliaNetwork();
        if (!isCorrectNetwork) { hideLoading(); return; }

        const response = await fetch(`${API_BASE_URL}/budgets/limit-proposals/${proposalId}`);
        if (!response.ok) throw new Error('Không thể tải thông tin đề xuất');
        const proposal = await response.json();

        const budgetList = await fetchBudgets();
        const budget = budgetList.find(b => b.id === currentBudgetId);
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Sắp xếp chữ ký
        const sortedSigs = proposal.signatures
            .sort((a, b) => a.signer_address.toLowerCase() < b.signer_address.toLowerCase() ? -1 : 1)
            .map(s => s.signature);

        const vaultContract = new ethers.Contract(budget.vault_address, SHARED_VAULT_ABI, signer);
        
        updateLoadingText('Đang gửi giao dịch lên Blockchain...');
        const limitAmountWei = ethers.parseEther(limitAmount.toString());
        
        const tx = await vaultContract.executeSetCategoryLimit(
            BigInt(categoryId),
            limitAmountWei,
            BigInt(nonce),
            BigInt(deadline),
            sortedSigs
        );
        
        updateLoadingText('Đang chờ mạng lưới xác nhận...');
        const receipt = await tx.wait();
        
        // Cập nhật trạng thái backend
        await fetch(`${API_BASE_URL}/budgets/limit-proposals/${proposalId}/executed?tx_hash=${receipt.hash}`, {
            method: 'POST'
        });

        showToast('success', 'Đã đặt ngưỡng chi tiêu thành công trên Blockchain!');
        openBudgetDashboard(currentBudgetId);
    } catch (err) {
        console.error('Execution error:', err);
        showToast('error', err.message || 'Lỗi khi thực thi');
    } finally {
        hideLoading();
    }
}

async function handleCancelLimitProposal(proposalId) {
    if (!confirm('Bạn có chắc chắn muốn hủy đề xuất đặt ngưỡng này?')) return;
    
    showLoading('Đang hủy đề xuất...');
    try {
        const response = await fetch(`${API_BASE_URL}/budgets/limit-proposals/${proposalId}?operator_address=${connectedAddress}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('success', 'Đã hủy đề xuất thành công');
            openBudgetDashboard(currentBudgetId);
        } else {
            const err = await response.json();
            throw new Error(err.detail || 'Lỗi khi hủy đề xuất');
        }
    } catch (err) {
        showToast('error', err.message);
    } finally {
        hideLoading();
    }
}

