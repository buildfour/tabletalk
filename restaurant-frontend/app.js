/* TableTalk AI - Restaurant Frontend JavaScript */

const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : `${window.location.protocol}//${window.location.host}`;

let orders = [];
let currentFilter = 'all';
let selectedOrder = null;
let ws = null;
let isAuthenticated = false;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    
    const authForm = document.getElementById('staffAuthForm');
    if (authForm) {
        authForm.addEventListener('submit', handleStaffAuth);
    }
    
    const notificationTextarea = document.getElementById('notificationMessage');
    if (notificationTextarea) {
        notificationTextarea.addEventListener('input', function() {
            const charCount = document.getElementById('charCount');
            if (charCount) charCount.textContent = this.value.length;
        });
    }
});

function checkAuth() {
    const staffAuth = localStorage.getItem('tabletalk_staff_auth');
    if (staffAuth) {
        isAuthenticated = true;
        showDashboard();
    }
}

async function handleStaffAuth(e) {
    e.preventDefault();
    const code = document.getElementById('staffCode').value.trim().toUpperCase();
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/staff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();
        if (data.valid) {
            localStorage.setItem('tabletalk_staff_auth', code);
            isAuthenticated = true;
            showDashboard();
            showToast('success', `Welcome ${data.name}!`);
        } else {
            showToast('error', 'Invalid staff code');
            document.getElementById('staffCode').value = '';
        }
    } catch (error) {
        showToast('error', 'Could not connect to server');
    }
}

function showDashboard() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('dashboardWrapper').style.display = 'block';
    loadOrders();
    initWebSocket();
}

function staffLogout() {
    localStorage.removeItem('tabletalk_staff_auth');
    isAuthenticated = false;
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('dashboardWrapper').style.display = 'none';
    if (ws) ws.close();
}

function initWebSocket() {
    ws = new WebSocket(API_BASE.replace('http', 'ws'));
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'new_order') {
            orders.unshift(data.order);
            renderOrders();
            updateActiveOrdersCount();
            showToast('success', `New order #${data.order.id} received!`);
        } else if (data.type === 'order_updated') {
            const idx = orders.findIndex(o => o.id === data.order.id);
            if (idx !== -1) orders[idx] = data.order;
            renderOrders();
            updateActiveOrdersCount();
        }
    };
    
    ws.onclose = () => setTimeout(initWebSocket, 3000);
}

async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/api/orders`);
        orders = await response.json();
        renderOrders();
        updateActiveOrdersCount();
    } catch (error) {
        console.error('Failed to load orders:', error);
    }
}

function renderOrders() {
    const ordersGrid = document.getElementById('ordersGrid');
    if (!ordersGrid) return;

    // Sort by status priority, then by time (newest first)
    const statusOrder = { received: 0, queued: 1, preparing: 2, ready: 3, completed: 4 };
    const sortedOrders = [...orders].sort((a, b) => {
        const statusDiff = statusOrder[a.status] - statusOrder[b.status];
        if (statusDiff !== 0) return statusDiff;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    let filteredOrders = sortedOrders;
    if (currentFilter !== 'all') {
        filteredOrders = sortedOrders.filter(order => order.status === currentFilter);
    }

    if (filteredOrders.length === 0) {
        ordersGrid.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.5 6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" clip-rule="evenodd"/></svg>
                <h3>No Orders Found</h3>
                <p>No orders match the selected filter</p>
            </div>
        `;
        return;
    }

    ordersGrid.innerHTML = filteredOrders.map(order => {
        const total = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return `
        <div class="order-card" onclick="openOrderModal(${order.id})">
            <div class="order-card-header">
                <span class="order-number">Order #${order.id}</span>
                <span class="order-time">${getTimeAgo(order.created_at)}</span>
            </div>
            <div class="table-info">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1z" clip-rule="evenodd"/></svg>
                <div class="table-details"><span class="table-number">Table ${order.table_code}</span></div>
            </div>
            <div class="order-items-preview">
                ${order.items.slice(0, 3).map(item => `<div class="item-preview"><span class="item-name">${item.name}</span><span class="item-qty">×${item.quantity}</span></div>`).join('')}
                ${order.items.length > 3 ? `<div class="item-preview"><span class="item-name">+${order.items.length - 3} more...</span></div>` : ''}
            </div>
            <div class="order-card-footer">
                <span class="order-total">$${total.toFixed(2)}</span>
                <span class="status-badge ${order.status}">${getStatusLabel(order.status)}</span>
            </div>
        </div>
    `}).join('');
}

function filterOrders(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.filter === filter) btn.classList.add('active');
    });
    renderOrders();
}

function openOrderModal(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    selectedOrder = order;

    document.getElementById('modalOrderNumber').textContent = `Order #${order.id}`;
    document.getElementById('modalTableNumber').textContent = order.table_code;
    document.getElementById('modalOrderTime').textContent = formatOrderTime(order.created_at);
    document.getElementById('modalCustomerName').textContent = order.table_code;

    const total = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('modalItems').innerHTML = order.items.map(item => `
        <div class="modal-item">
            <div><span class="modal-item-name">${item.name}</span><span class="modal-item-qty">×${item.quantity}</span></div>
            <span class="modal-item-price">$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
    document.getElementById('modalTotal').textContent = `$${total.toFixed(2)}`;

    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.status === order.status) btn.classList.add('active');
    });

    document.getElementById('queueNumber').value = order.queue_number || '';
    document.getElementById('waitTime').value = order.wait_time || '';
    document.getElementById('notificationMessage').value = '';
    document.getElementById('charCount').textContent = '0';
    document.getElementById('orderModal').classList.add('active');
}

function closeModal() {
    document.getElementById('orderModal').classList.remove('active');
    selectedOrder = null;
}

async function updateStatus(newStatus) {
    if (!selectedOrder) return;
    try {
        await fetch(`${API_BASE}/api/orders/${selectedOrder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.status === newStatus) btn.classList.add('active');
        });
        showToast('success', `Order status updated to: ${getStatusLabel(newStatus)}`);
    } catch (error) {
        showToast('error', 'Failed to update status');
    }
}

async function updateQueueInfo() {
    if (!selectedOrder) return;
    const queueNumber = parseInt(document.getElementById('queueNumber').value) || null;
    const waitTime = parseInt(document.getElementById('waitTime').value) || null;
    
    try {
        await fetch(`${API_BASE}/api/orders/${selectedOrder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queue_number: queueNumber, wait_time: waitTime })
        });
        showToast('success', 'Queue information updated');
    } catch (error) {
        showToast('error', 'Failed to update queue info');
    }
}

async function sendNotification() {
    if (!selectedOrder) return;
    const message = document.getElementById('notificationMessage').value.trim();
    if (!message) {
        showToast('error', 'Please enter a notification message');
        return;
    }
    
    try {
        await fetch(`${API_BASE}/api/orders/${selectedOrder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notification: message })
        });
        document.getElementById('notificationMessage').value = '';
        document.getElementById('charCount').textContent = '0';
        showToast('success', 'Notification sent to customer');
    } catch (error) {
        showToast('error', 'Failed to send notification');
    }
}

function getTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const diff = Math.floor((Date.now() - date) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    return `${Math.floor(diff / 60)}h ago`;
}

function formatOrderTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusLabel(status) {
    const labels = { received: 'New', queued: 'Queued', preparing: 'Preparing', ready: 'Ready', completed: 'Completed' };
    return labels[status] || status;
}

function updateActiveOrdersCount() {
    const count = orders.filter(o => o.status !== 'completed').length;
    const el = document.getElementById('activeOrders');
    if (el) el.textContent = count;
}

function showToast(type, message) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor">
            ${type === 'success'
                ? '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>'
                : '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>'
            }
        </svg>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.filterOrders = filterOrders;
window.openOrderModal = openOrderModal;
window.closeModal = closeModal;
window.updateStatus = updateStatus;
window.updateQueueInfo = updateQueueInfo;
window.sendNotification = sendNotification;
window.staffLogout = staffLogout;
