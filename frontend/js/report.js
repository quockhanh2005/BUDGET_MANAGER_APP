/* ========================================
   Báo Cáo Chi Tiêu (Reporting & Analytics)
   ======================================== */

let _spendingChart = null;
let _incomeExpenseChart = null;

async function openReportModal(mode = 'global') {
    showLoading('Đang phân tích dữ liệu chi tiêu...');
    try {
        let budgets = await fetchBudgets();
        if (!budgets || budgets.length === 0) {
            hideLoading();
            showToast('info', 'Bạn chưa có quỹ nào để xem báo cáo.');
            return;
        }

        let title = "Báo Cáo Chi Tiêu Tổng Hợp";
        if (mode === 'single' && typeof currentBudgetId !== 'undefined' && currentBudgetId) {
            const singleBudget = budgets.find(b => b.id === currentBudgetId);
            if (singleBudget) {
                budgets = [singleBudget];
                title = `Báo Cáo Chi Tiêu: ${singleBudget.name}`;
            }
        }

        const titleEl = document.getElementById('report-modal-title');
        if (titleEl) titleEl.textContent = title;

        const stats = aggregateTransactionData(budgets);
        renderReportStats(stats);
        renderCharts(stats);
        renderCategoryList(stats);

        document.getElementById('report-modal').classList.remove('hidden');
    } catch (err) {
        console.error('Report Error:', err);
        showToast('error', 'Lỗi khi tải báo cáo: ' + err.message);
    } finally {
        hideLoading();
    }
}

function aggregateTransactionData(budgets) {
    let totalIncome = 0;
    let totalExpense = 0;
    const categories = {}; // { "Tiền điện": 0.05, ... }

    budgets.forEach(budget => {
        if (!budget.transactions) return;

        budget.transactions.forEach(tx => {
            const amount = Math.abs(tx.amount);
            if (tx.type === 'deposit') {
                totalIncome += amount;
            } else if (tx.type === 'withdraw') {
                totalExpense += amount;
                
                // Extract category from title
                // Format: "Rút tiền: ⚡ Tiền điện: ..." or just "⚡ Tiền điện: ..."
                let category = 'Khác';
                let title = tx.title || '';
                
                // Remove prefix "Rút tiền: " if exists
                title = title.replace('Rút tiền: ', '');
                
                // Try to find category with emoji
                const match = title.match(/^(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3?|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c[\udc04|\udd70-\udd71|\udd7e-\udd7f|\udd8e|\udd91-\udd9a|\udde6-\uddff|[\ude01-\ude02]|\ude1a|\ude2f|[\ude32-\ude3a]|[\ude50-\ude51])\s*([^:]+)/);
                
                if (match && match[1]) {
                    category = match[1].trim();
                } else if (title.includes(':')) {
                    category = title.split(':')[0].trim();
                }

                categories[category] = (categories[category] || 0) + amount;
            }
        });
    });

    return {
        totalIncome,
        totalExpense,
        netFlow: totalIncome - totalExpense,
        categories
    };
}

function renderReportStats(stats) {
    document.getElementById('report-total-income').textContent = stats.totalIncome.toFixed(4);
    document.getElementById('report-total-expense').textContent = stats.totalExpense.toFixed(4);
    
    const netEl = document.getElementById('report-net-flow');
    netEl.textContent = stats.netFlow.toFixed(4);
    netEl.parentElement.className = 'stat-value ' + (stats.netFlow >= 0 ? 'positive' : 'negative');
}

function renderCharts(stats) {
    // 1. Spending Category Chart (Pie/Doughnut)
    const categoryLabels = Object.keys(stats.categories);
    const categoryValues = Object.values(stats.categories);
    
    const ctxCategory = document.getElementById('spendingCategoryChart').getContext('2d');
    
    if (_spendingChart) _spendingChart.destroy();
    
    if (categoryLabels.length === 0) {
        // Handle empty state for chart
        _spendingChart = new Chart(ctxCategory, {
            type: 'doughnut',
            data: {
                labels: ['Chưa có dữ liệu'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                cutout: '70%',
                plugins: { legend: { display: false } }
            }
        });
    } else {
        _spendingChart = new Chart(ctxCategory, {
            type: 'doughnut',
            data: {
                labels: categoryLabels,
                datasets: [{
                    data: categoryValues,
                    backgroundColor: [
                        '#800080', '#4B0082', '#00FFCC', '#FFD700', 
                        '#FF3366', '#FFA500', '#0088FF', '#9932CC'
                    ],
                    borderColor: 'rgba(10, 5, 16, 0.8)',
                    borderWidth: 2,
                    hoverOffset: 15
                }]
            },
            options: {
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#D1D1E9', padding: 20, font: { family: 'Be Vietnam Pro', size: 11 } }
                    }
                },
                animation: { animateScale: true, animateRotate: true }
            }
        });
    }

    // 2. Income vs Expense Chart (Bar)
    const ctxIE = document.getElementById('incomeExpenseChart').getContext('2d');
    
    if (_incomeExpenseChart) _incomeExpenseChart.destroy();
    
    _incomeExpenseChart = new Chart(ctxIE, {
        type: 'bar',
        data: {
            labels: ['Tiền vào (Income)', 'Tiền ra (Expense)'],
            datasets: [{
                data: [stats.totalIncome, stats.totalExpense],
                backgroundColor: ['rgba(0, 255, 204, 0.6)', 'rgba(255, 51, 102, 0.6)'],
                borderColor: ['#00FFCC', '#FF3366'],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8E8EA0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#D1D1E9' }
                }
            }
        }
    });
}

function renderCategoryList(stats) {
    const listEl = document.getElementById('report-category-list');
    listEl.innerHTML = '';

    const categories = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]);

    // Thêm logic tóm tắt phân tích
    const summaryEl = document.createElement('div');
    summaryEl.className = 'report-summary-box';
    summaryEl.style.cssText = `
        margin-bottom: 20px;
        padding: 15px;
        background: rgba(128, 0, 128, 0.1);
        border-radius: 12px;
        border: 1px solid rgba(128, 0, 128, 0.2);
    `;
    
    if (categories.length > 0) {
        const topCat = categories[0];
        summaryEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 20px;">📊</span>
                <span style="font-size: 0.9rem; color: var(--text-secondary);">
                    Phân tích: Hạng mục <strong>${topCat[0]}</strong> đang được chi dùng nhiều nhất với <strong>${topCat[1].toFixed(4)} ETH</strong>.
                </span>
            </div>
        `;
    } else {
        summaryEl.innerHTML = '<span style="font-size: 0.9rem; color: var(--text-muted);">Chưa có dữ liệu chi tiêu để phân tích.</span>';
    }
    listEl.appendChild(summaryEl);

    if (categories.length === 0) {
        return;
    }

    categories.forEach(([name, amount]) => {
        const percentage = ((amount / stats.totalExpense) * 100).toFixed(1);
        
        const row = document.createElement('div');
        row.className = 'category-report-row';
        row.style.cssText = `
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 12px 16px; 
            background: rgba(255, 255, 255, 0.03); 
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        `;
        
        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="category-dot" style="width: 10px; height: 10px; border-radius: 50%; background: var(--primary);"></div>
                <span style="font-weight: 500;">${name}</span>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: 700; color: var(--text-primary);">${amount.toFixed(4)} ETH</div>
                <div style="font-size: 11px; color: var(--text-muted);">${percentage}% của tổng chi</div>
            </div>
        `;
        listEl.appendChild(row);
    });
}
