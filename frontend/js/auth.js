/* ========================================
   Đăng ký thành viên (Auth/Registration)
   ======================================== */

async function handleContinue() {
    console.log('HandleContinue triggered for address:', connectedAddress);
    if (!connectedAddress) { showToast('error', 'Vui lòng kết nối ví trước!'); return; }

    showLoading('Đang xác thực tài khoản...');
    try {
        const url = `${API_BASE_URL}/members/?address=${connectedAddress}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (response.ok) {
            const member = await response.json();
            currentMemberProfile = member;
            hideLoading();
            renderDashboard(member);
            startBalanceAutoRefresh(); // Bắt đầu vòng lặp cập nhật
            showToast('success', `Chào mừng quay lại, ${member.name}!`);
        } else if (response.status === 404) {
            hideLoading();
            goToStep(2);
        } else {
            throw new Error('Lỗi máy chủ khi kiểm tra thành viên');
        }
    } catch (error) {
        hideLoading();
        console.error('API Error:', error);
        showToast('error', 'Lỗi: ' + error.message);
    }
}

function validateForm() {
    const memberId = document.getElementById('member_id').value.trim();
    const name = document.getElementById('name').value.trim();
    const age = document.getElementById('age').value;
    if (!memberId) { showToast('error', 'Vui lòng nhập mã định danh (CCCD).'); document.getElementById('member_id').focus(); return false; }
    if (!name) { showToast('error', 'Vui lòng nhập họ và tên.'); document.getElementById('name').focus(); return false; }
    if (!age || parseInt(age) < 1 || parseInt(age) > 150) { showToast('error', 'Vui lòng nhập tuổi hợp lệ (1-150).'); document.getElementById('age').focus(); return false; }
    return true;
}

function populateReview() {
    document.getElementById('review-member-id').textContent = document.getElementById('member_id').value.trim();
    document.getElementById('review-name').textContent = document.getElementById('name').value.trim();
    document.getElementById('review-age').textContent = document.getElementById('age').value;
    document.getElementById('review-email').textContent = document.getElementById('email').value.trim() || '(không có)';
    document.getElementById('review-address').textContent = connectedAddress;
}

async function signAndSubmit() {
    if (!connectedAddress) { showToast('error', 'Ví đã bị ngắt kết nối. Vui lòng kết nối lại.'); resetToStep1(); return; }
    const btnSign = document.getElementById('btn-sign');
    btnSign.disabled = true;
    showLoading('Đang chờ chữ ký từ MetaMask...');
    try {
        const message = SIGN_MESSAGE_PREFIX + connectedAddress;
        const signature = await window.ethereum.request({ method: 'personal_sign', params: [message, connectedAddress] });
        updateLoadingText('Đang gửi dữ liệu lên server...');
        const memberData = {
            member_id: document.getElementById('member_id').value.trim(),
            name: document.getElementById('name').value.trim(),
            age: parseInt(document.getElementById('age').value),
            member_address: connectedAddress,
            email: document.getElementById('email').value.trim() || null,
            signature: signature,
            message: message,
        };
        const response = await fetch(`${API_BASE_URL}/members/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(memberData) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Lỗi từ server');
        hideLoading();
        showSuccessState(result);
        showToast('success', 'Đăng ký thành viên thành công!');
    } catch (error) {
        hideLoading();
        btnSign.disabled = false;
        if (error.code === 4001) showToast('error', 'Bạn đã từ chối ký message.');
        else showToast('error', `Lỗi: ${error.message}`);
    }
}

function showSuccessState(member, isExisting = false) {
    currentMemberProfile = member;
    renderDashboard(member);
    startBalanceAutoRefresh(); // Bắt đầu vòng lặp cập nhật
}

function resetForm() {
    document.getElementById('member-form').reset();
    goToStep(1);
    if (connectedAddress) {
        updateWalletUI();
    }
    document.getElementById('btn-sign').disabled = false;
}
