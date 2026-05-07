/* ========================================
   Hệ thống Thông báo (Notification System)
   ======================================== */

let notifications = [];

async function initNotifications() {
    if (!connectedAddress) return;
    await fetchNotifications();
    
    // Tự động làm mới mỗi 30 giây
    setInterval(fetchNotifications, 30000);
}

async function fetchNotifications() {
    if (!connectedAddress) return;
    try {
        const response = await fetch(`${API_BASE_URL}/notifications/?address=${connectedAddress.toLowerCase()}`);
        if (response.ok) {
            notifications = await response.json();
            updateNotificationUI();
        }
    } catch (err) {
        console.error('Error fetching notifications:', err);
    }
}

function updateNotificationUI() {
    const badge = document.getElementById('notification-badge');
    const modalCount = document.getElementById('notification-count-modal');
    
    const unreadCount = notifications.filter(n => !n.is_read).length;
    
    if (unreadCount > 0) {
        badge.textContent = unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
    
    if (modalCount) modalCount.textContent = unreadCount;
    
    renderNotificationList();
}

function renderNotificationList() {
    const listEl = document.getElementById('notification-list-full');
    if (!listEl) return;
    
    if (notifications.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><p>Không có thông báo nào</p></div>';
        return;
    }
    
    listEl.innerHTML = '';
    notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = `notification-item ${n.is_read ? '' : 'unread'} type-${n.type}`;
        item.onclick = () => handleNotificationClick(n);
        
        const dateStr = new Date(n.created_at).toLocaleString('vi-VN');
        
        item.innerHTML = `
            <div class="notification-icon">
                ${getNotificationIcon(n.type)}
            </div>
            <div class="notification-content">
                <div class="notification-header">
                    <span class="notification-title">${n.title}</span>
                    <span class="notification-time">${dateStr}</span>
                </div>
                <p class="notification-msg">${n.message}</p>
            </div>
            ${!n.is_read ? '<div class="unread-dot"></div>' : ''}
        `;
        listEl.appendChild(item);
    });
}

function getNotificationIcon(type) {
    switch(type) {
        case 'success': return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        case 'warning': return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
        case 'danger': return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        default: return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2196f3" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
}

async function handleNotificationClick(n) {
    if (!n.is_read) {
        await markAsRead(n.id);
    }
    
    if (n.budget_id) {
        closeModal('notification-modal');
        openBudgetDashboard(n.budget_id);
    }
}

async function markAsRead(id) {
    try {
        await fetch(`${API_BASE_URL}/notifications/${id}/read`, { method: 'POST' });
        notifications = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
        updateNotificationUI();
    } catch (err) {
        console.error('Error marking as read:', err);
    }
}

async function markAllNotificationsRead() {
    if (!connectedAddress) return;
    try {
        await fetch(`${API_BASE_URL}/notifications/read-all?address=${connectedAddress.toLowerCase()}`, { method: 'POST' });
        notifications = notifications.map(n => ({ ...n, is_read: true }));
        updateNotificationUI();
        showToast('success', 'Đã đánh dấu tất cả là đã đọc');
    } catch (err) {
        console.error('Error marking all as read:', err);
    }
}

function toggleNotificationPanel() {
    openModal('notification-modal');
}
