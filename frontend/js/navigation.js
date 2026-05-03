/* ========================================
   Điều hướng các bước (Navigation)
   ======================================== */

function goToStep(step) {
    console.log('Going to step:', step);
    const container = document.querySelector('.container');

    if (step === 'dashboard' || step === 'budget-dashboard' || step === 'budget-management') {
        container.classList.add('wide');
        document.querySelector('.steps').style.display = 'none';
        
        // Ẩn thẻ wizard chính
        const wizardEl = document.getElementById('main-wizard');
        if (wizardEl) wizardEl.classList.add('hidden');
        
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        let targetId;
        if (step === 'dashboard') targetId = 'step-dashboard';
        else if (step === 'budget-dashboard') targetId = 'step-budget-dashboard';
        else targetId = 'step-budget-management';
        document.getElementById(targetId).classList.add('active');
        currentStep = step;
        return;
    }

    container.classList.remove('wide');
    document.querySelector('.steps').style.display = 'flex';
    
    // Hiện thẻ wizard chính
    const wizardEl = document.getElementById('main-wizard');
    if (wizardEl) wizardEl.classList.remove('hidden');

    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step-indicator-${i}`);
        if (i < step) { indicator.classList.add('completed'); indicator.classList.remove('active'); }
        else if (i === step) { indicator.classList.add('active'); indicator.classList.remove('completed'); }
        else { indicator.classList.remove('active', 'completed'); }
        const line = document.getElementById(`step-line-${i}`);
        if (line) { if (i < step) line.classList.add('active'); else line.classList.remove('active'); }
    }

    document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
    const targetContent = document.getElementById(`step-${step}`);
    if (targetContent) targetContent.classList.add('active');
    currentStep = step;
}

function resetToStep1() {
    connectedAddress = null;
    connectedChainId = null;
    const statusEl = document.getElementById('wallet-status');
    statusEl.innerHTML = `<div class="status-dot disconnected"></div><span>Chưa kết nối</span>`;
    document.getElementById('btn-connect').classList.remove('hidden');
    document.getElementById('btn-connect').disabled = false;
    document.getElementById('btn-connect').innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
        Kết nối MetaMask
    `;
    document.getElementById('wallet-connected').classList.add('hidden');
    goToStep(1);
}
