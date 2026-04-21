const elements = {
    // Status Badges
    vpnBadge: document.getElementById('vpn-status-badge'),
    
    // Controls
    vpnMessage: document.getElementById('vpn-message'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    
    // Stats
    statUptime: document.getElementById('stat-uptime')
};

// ==========================================
// Initialization
// ==========================================

async function init() {
    await fetchStatus();
    setupEventListeners();
    
    // İstatistikleri periyodik güncelle
    setInterval(fetchStatus, 3000);
}

// ==========================================
// API Calls
// ==========================================

// Backend URL (Vercel'den girildiğinde localhost'a bağlanacak)
const API_BASE = 'http://localhost:3000';

async function fetchStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/status`);
        const data = await res.json();
        
        updateUI(data);
    } catch (error) {
        console.error('Status fetch error:', error);
        elements.vpnBadge.className = 'badge danger';
        elements.vpnBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Sunucu Hatası';
        elements.vpnMessage.textContent = 'Sunucuya bağlanılamadı. Uygulamanın arka planda çalıştığından emin olun.';
    }
}

// ==========================================
// Event Listeners
// ==========================================

function setupEventListeners() {
    // Başlat Butonu
    elements.btnStart.addEventListener('click', async () => {
        elements.btnStart.disabled = true;
        elements.btnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Bağlanıyor... (Kurulum yapılıyorsa 30 sn sürebilir)';
        
        try {
            const res = await fetch(`${API_BASE}/api/vpn/start`, { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                await fetchStatus();
            } else {
                showToast(data.message, 'error');
            }
        } catch (error) {
            showToast('Hata oluştu!', 'error');
        } finally {
            elements.btnStart.disabled = false;
            elements.btnStart.innerHTML = '<i class="fa-solid fa-power-off"></i> VPN\'e Bağlan';
        }
    });

    // Durdur Butonu
    elements.btnStop.addEventListener('click', async () => {
        elements.btnStop.disabled = true;
        elements.btnStop.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kapatılıyor...';
        
        try {
            const res = await fetch(`${API_BASE}/api/vpn/stop`, { method: 'POST' });
            const data = await res.json();
            
            if (data.success) {
                showToast(data.message, 'info');
                await fetchStatus();
            } else {
                showToast(data.message, 'error');
            }
        } catch (error) {
            showToast('Hata oluştu!', 'error');
        } finally {
            elements.btnStop.disabled = false;
            elements.btnStop.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Bağlantıyı Kes';
        }
    });
}

// ==========================================
// UI Updates
// ==========================================

function updateUI(data) {
    const { vpn } = data;

    if (!vpn) return;

    elements.vpnMessage.textContent = vpn.statusMessage || 'Sistem Hazır.';

    if (vpn.running) {
        elements.vpnBadge.className = 'badge success';
        elements.vpnBadge.innerHTML = '<i class="fa-solid fa-shield-check"></i> VPN Aktif';
        
        elements.btnStart.classList.add('hidden');
        elements.btnStop.classList.remove('hidden');
        elements.vpnMessage.className = 'highlight';
    } else {
        elements.vpnBadge.className = 'badge warning';
        elements.vpnBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Korumasız';
        
        elements.btnStart.classList.remove('hidden');
        elements.btnStop.classList.add('hidden');
        elements.vpnMessage.className = 'dim';
    }

    elements.statUptime.textContent = formatUptime(vpn.uptimeSeconds);
}

function formatUptime(seconds) {
    if (!seconds) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

// ==========================================
// Helpers (Toast)
// ==========================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-xmark-circle';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Start app
document.addEventListener('DOMContentLoaded', init);
