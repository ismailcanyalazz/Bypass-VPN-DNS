/**
 * BypassDNS Dashboard v2.0 - Frontend Logic
 */

const API = 'http://localhost:3000';

// DOM Referanslari
const el = {
    // Power
    powerBtn: document.getElementById('btn-power'),
    powerRing: document.getElementById('power-ring-outer'),
    powerStatusText: document.getElementById('power-status-text'),
    powerStatusSub: document.getElementById('power-status-sub'),
    // Header
    connIndicator: document.getElementById('connection-indicator'),
    connText: document.getElementById('conn-text'),
    headerIp: document.getElementById('header-ip'),
    vpnIpDisplay: document.getElementById('vpn-ip-display'),
    // Stats
    statUptime: document.getElementById('stat-uptime'),
    statQueries: document.getElementById('stat-queries'),
    statCached: document.getElementById('stat-cached'),
    statPing: document.getElementById('stat-ping'),
    statBlocked: document.getElementById('stat-blocked'),
    statFailed: document.getElementById('stat-failed'),
    // DPI Status
    dpiBadge: document.getElementById('dpi-badge'),
    dpiDesc: document.getElementById('dpi-desc'),
    dpiDetail: document.getElementById('dpi-detail'),
    dpiModeDisplay: document.getElementById('dpi-mode-display'),
    dpiUptime: document.getElementById('dpi-uptime'),
    // DNS Status
    dnsBadge: document.getElementById('dns-badge'),
    dnsDesc: document.getElementById('dns-desc'),
    dnsDetail: document.getElementById('dns-detail'),
    dnsProviderDisplay: document.getElementById('dns-provider-display'),
    // VPN Status
    vpnBadge: document.getElementById('vpn-badge'),
    vpnDesc: document.getElementById('vpn-desc'),
    vpnDetail: document.getElementById('vpn-detail'),
    vpnIpDetail: document.getElementById('vpn-ip-detail'),
    vpnUptime: document.getElementById('vpn-uptime'),
    // VPN Buttons
    btnVpnStart: document.getElementById('btn-vpn-start'),
    btnVpnStop: document.getElementById('btn-vpn-stop'),
    // DoH Provider
    dohProvider: document.getElementById('doh-provider'),
    // DPI Mode
    dpiModeButtons: document.getElementById('dpi-mode-buttons'),
    // DNS Test
    testDomain: document.getElementById('test-domain'),
    testType: document.getElementById('test-type'),
    btnDnsTest: document.getElementById('btn-dns-test'),
    dnsTestResult: document.getElementById('dns-test-result'),
    // Sys
    sysPlatform: document.getElementById('sys-platform'),
    sysNode: document.getElementById('sys-node'),
    sysMem: document.getElementById('sys-mem'),
    sysUptime: document.getElementById('sys-uptime'),
    // Logs
    logTbody: document.getElementById('log-tbody'),
    btnClearLogs: document.getElementById('btn-clear-logs'),
    footerStatus: document.getElementById('footer-status'),
};

// App State
let state = {
    dpiRunning: false,
    dnsRunning: false,
    vpnRunning: false,
    selectedMode: '-5',
    logCount: 0,
    maxLogRows: 100,
    sseConnected: false,
    pingInterval: null,
    statusInterval: null,
    uptimeInterval: null,
    dpiStartTime: null,
    dpiUptimeSec: 0,
};

// ==========================================
// INIT
// ==========================================
async function init() {
    setupEventListeners();
    await fetchStatus();
    await fetchPing();
    connectSSE();

    state.statusInterval = setInterval(fetchStatus, 4000);
    state.pingInterval = setInterval(fetchPing, 8000);

    // Kayitli saglayiciyi yukle
    const savedProvider = localStorage.getItem('dohProvider') || 'cloudflare';
    el.dohProvider.value = savedProvider;
}

// ==========================================
// API CALLS
// ==========================================
async function fetchStatus() {
    try {
        const res = await fetch(`${API}/api/status`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        updateUI(data);
    } catch (e) {
        setConnectionError();
    }
}

async function fetchPing() {
    try {
        const res = await fetch(`${API}/api/ping`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.success && data.latency !== null) {
            el.statPing.textContent = data.latency + ' ms';
            el.statPing.style.color = data.latency < 80 ? 'var(--success)' : data.latency < 200 ? 'var(--warning)' : 'var(--danger)';
        } else {
            el.statPing.textContent = '--';
        }
    } catch (e) {
        el.statPing.textContent = '--';
    }
}

async function fetchVpnIp() {
    try {
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        el.vpnIpDisplay.textContent = data.ip;
        el.vpnIpDetail.textContent = data.ip;
        el.headerIp.style.display = 'flex';
    } catch (e) {
        el.vpnIpDisplay.textContent = 'Bilinmiyor';
    }
}

// ==========================================
// SSE - Canli Log Akisi
// ==========================================
function connectSSE() {
    if (state.sseConnected) return;
    try {
        const es = new EventSource(`${API}/api/logs/stream`);
        es.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                if (data.type === 'connected') { state.sseConnected = true; return; }
                appendLogRow(data);
            } catch (e) {}
        };
        es.onerror = () => {
            state.sseConnected = false;
            es.close();
            setTimeout(connectSSE, 5000); // Yeniden baglan
        };
    } catch (e) {}
}

// ==========================================
// UI UPDATE
// ==========================================
function updateUI(data) {
    const { dpi, dns, vpn, stats, server } = data;
    const anyRunning = (dpi && dpi.running) || (dns && dns.running) || (vpn && vpn.running);

    // Genel baglanti durumu
    updateConnectionState(dpi, dns, vpn);

    // Stats
    if (stats) {
        el.statQueries.textContent = stats.totalQueries || 0;
        el.statCached.textContent = stats.cachedResponses || 0;
        el.statBlocked.textContent = stats.blockedQueries || 0;
        el.statFailed.textContent = stats.failedQueries || 0;
        if (anyRunning) {
            const uptime = (vpn && vpn.running && vpn.uptimeSeconds) || (dpi && dpi.running && dpi.uptimeSeconds) || 0;
            el.statUptime.textContent = formatUptime(uptime);
        }
    }

    // DPI
    if (dpi) {
        state.dpiRunning = dpi.running;
        state.dpiUptimeSec = dpi.uptimeSeconds || 0;
        if (dpi.running) {
            el.dpiBadge.className = 'badge success';
            el.dpiBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Aktif';
            el.dpiDesc.textContent = 'DPI engeli atlatma motoru calisıyor.';
            el.dpiDetail.style.display = 'flex';
            el.dpiModeDisplay.textContent = dpi.mode || state.selectedMode;
            el.dpiUptime.textContent = formatUptime(dpi.uptimeSeconds);
        } else {
            el.dpiBadge.className = 'badge danger';
            el.dpiBadge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Kapalı';
            el.dpiDesc.textContent = 'DPI engeli atlatma motoru hazır.';
            el.dpiDetail.style.display = 'none';
        }
    }

    // DNS
    if (dns) {
        state.dnsRunning = dns.running;
        if (dns.running) {
            el.dnsBadge.className = 'badge success';
            el.dnsBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Aktif';
            el.dnsDesc.textContent = 'DNS-over-HTTPS proxy sorguları yonlendiriyor.';
            el.dnsDetail.style.display = 'flex';
            el.dnsProviderDisplay.textContent = dns.provider ? dns.provider.name : '--';
        } else {
            el.dnsBadge.className = 'badge warning';
            el.dnsBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Kapalı';
            el.dnsDesc.textContent = 'DNS-over-HTTPS proxy hazır (Port 53 icin Admin gerekli).';
            el.dnsDetail.style.display = 'none';
        }
    }

    // VPN
    if (vpn) {
        state.vpnRunning = vpn.running;
        if (vpn.running) {
            el.vpnBadge.className = 'badge success';
            el.vpnBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Bağlı';
            el.vpnDesc.textContent = vpn.statusMessage || 'WireGuard tüneli aktif.';
            el.vpnDetail.style.display = 'flex';
            el.vpnUptime.textContent = formatUptime(vpn.uptimeSeconds);
            el.btnVpnStart.classList.add('hidden');
            el.btnVpnStop.classList.remove('hidden');
            if (!el.headerIp.style.display || el.headerIp.style.display === 'none') fetchVpnIp();
        } else {
            el.vpnBadge.className = 'badge warning';
            el.vpnBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Kapalı';
            el.vpnDesc.textContent = vpn.statusMessage || 'Cloudflare WARP tüneli hazır.';
            el.vpnDetail.style.display = 'none';
            el.btnVpnStart.classList.remove('hidden');
            el.btnVpnStop.classList.add('hidden');
            el.headerIp.style.display = 'none';
        }
    }

    // Sistem
    if (server) {
        el.sysPlatform.textContent = server.platform === 'win32' ? 'Windows' : server.platform;
        el.sysNode.textContent = server.nodeVersion;
        el.sysMem.textContent = server.memory ? Math.round(server.memory.rss / 1024 / 1024) + ' MB' : '--';
        el.sysUptime.textContent = formatUptime(Math.floor(server.uptime));
    }

    // Guc butonu durumu
    updatePowerButton(dpi, dns);
}

function updateConnectionState(dpi, dns, vpn) {
    const dpiOn = dpi && dpi.running;
    const dnsOn = dns && dns.running;
    const vpnOn = vpn && vpn.running;

    if (dpiOn || dnsOn) {
        document.body.classList.remove('connecting');
        document.body.classList.add('connected');
        el.connIndicator.className = 'conn-indicator online';
        el.connText.textContent = vpnOn ? 'VPN + Bypass Aktif' : 'Bypass Aktif';
        el.powerStatusText.textContent = vpnOn ? 'Tam Koruma' : 'Bypass Aktif';
        el.powerStatusSub.textContent = 'DPI engeli asilıyor';
    } else {
        document.body.classList.remove('connected', 'connecting');
        el.connIndicator.className = 'conn-indicator offline';
        el.connText.textContent = 'Korumasız';
        el.powerStatusText.textContent = 'Korumasız';
        el.powerStatusSub.textContent = 'Başlatmak icin butona bas';
    }
}

function updatePowerButton(dpi, dns) {
    const running = (dpi && dpi.running) || (dns && dns.running);
    el.powerBtn.innerHTML = running
        ? '<i class="fa-solid fa-power-off"></i>'
        : '<i class="fa-solid fa-power-off"></i>';
    el.powerBtn.disabled = false;
}

function setConnectionError() {
    document.body.classList.remove('connected', 'connecting');
    el.connIndicator.className = 'conn-indicator offline';
    el.connText.textContent = 'Sunucu Hatası';
    el.powerStatusText.textContent = 'Bağlanamadı';
    el.powerStatusSub.textContent = 'npm start ile sunucuyu başlatın';
    el.footerStatus.textContent = 'Bağlantı hatası';
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Guc Butonu
    el.powerBtn.addEventListener('click', toggleBypass);

    // DoH Provider Degisimi
    el.dohProvider.addEventListener('change', async () => {
        const key = el.dohProvider.value;
        localStorage.setItem('dohProvider', key);
        try {
            await fetch(`${API}/api/providers/${key}`, { method: 'POST' });
            showToast('DNS sağlayıcı değiştirildi.', 'info');
        } catch (e) {
            showToast('Sağlayıcı değiştirilemedi!', 'error');
        }
    });

    // DPI Mod Butonu
    el.dpiModeButtons.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el.dpiModeButtons.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedMode = btn.dataset.mode;
        });
    });
    // Varsayilan mod
    el.dpiModeButtons.querySelector('[data-mode="-5"]').classList.add('active');
    state.selectedMode = '-5';

    // VPN Kontrol
    el.btnVpnStart.addEventListener('click', async () => {
        el.btnVpnStart.disabled = true;
        el.btnVpnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Bağlanıyor...';
        try {
            const res = await fetch(`${API}/api/vpn/start`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast(data.message, 'success');
                await fetchStatus();
                await fetchVpnIp();
            } else {
                // Detayli hata goster
                const msg = data.message || data.error || 'Bilinmeyen hata';
                const isAdminErr = msg.toLowerCase().includes('yonetici') || msg.toLowerCase().includes('admin');
                if (isAdminErr) {
                    showAdminError();
                } else {
                    showToast('VPN Hatasi: ' + msg, 'error');
                }
            }
        } catch (e) {
            showToast('Sunucuya ulasılamadi! npm start ile calistiriyor musunuz?', 'error');
        } finally {
            el.btnVpnStart.disabled = false;
            el.btnVpnStart.innerHTML = '<i class="fa-solid fa-circle-play"></i> VPN Baglan';
        }
    });

    el.btnVpnStop.addEventListener('click', async () => {
        el.btnVpnStop.disabled = true;
        el.btnVpnStop.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kesiliyor...';
        try {
            const res = await fetch(`${API}/api/vpn/stop`, { method: 'POST' });
            const data = await res.json();
            showToast(data.message, 'info');
            await fetchStatus();
            el.headerIp.style.display = 'none';
        } catch (e) {
            showToast('VPN durdurulamadı!', 'error');
        } finally {
            el.btnVpnStop.disabled = false;
            el.btnVpnStop.innerHTML = '<i class="fa-solid fa-circle-stop"></i> VPN Kes';
        }
    });

    // DNS Test
    el.btnDnsTest.addEventListener('click', dnsTest);
    el.testDomain.addEventListener('keydown', (e) => { if (e.key === 'Enter') dnsTest(); });

    // Log temizle
    el.btnClearLogs.addEventListener('click', async () => {
        try {
            await fetch(`${API}/api/logs`, { method: 'DELETE' });
            el.logTbody.innerHTML = '<tr class="empty-row"><td colspan="6"><i class="fa-solid fa-satellite-dish"></i><span>Loglar temizlendi.</span></td></tr>';
            state.logCount = 0;
            showToast('Loglar temizlendi.', 'info');
        } catch (e) {}
    });
}

// ==========================================
// BYPASS TOGGLE (Ana Guc Butonu)
// ==========================================
async function toggleBypass() {
    const running = state.dpiRunning || state.dnsRunning;

    el.powerBtn.disabled = true;
    document.body.classList.add('connecting');
    document.body.classList.remove('connected');
    el.powerStatusText.textContent = running ? 'Durduruluyor...' : 'Başlatılıyor...';
    el.powerStatusSub.textContent = 'Lütfen bekleyin...';
    el.connIndicator.className = 'conn-indicator connecting';
    el.connText.textContent = running ? 'Durduruluyor' : 'Bağlanıyor';

    try {
        if (running) {
            // Durdur: GoodbyeDPI + DNS
            const [dpiRes] = await Promise.allSettled([
                fetch(`${API}/api/dpi/stop`, { method: 'POST' }),
                fetch(`${API}/api/dns/stop`, { method: 'POST' }),
            ]);
            showToast('Bypass durduruldu.', 'info');
        } else {
            // Baslat: GoodbyeDPI + DNS
            const dpiRes = await fetch(`${API}/api/dpi/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: state.selectedMode })
            });
            const dpiData = await dpiRes.json();

            if (!dpiData.success) throw new Error(dpiData.message || 'DPI başlatılamadı.');

            // DNS Proxy da baslat (hata olursa uyar ama devam et)
            try {
                await fetch(`${API}/api/dns/start`, { method: 'POST' });
            } catch (e) {}

            showToast(dpiData.message || 'Bypass başlatıldı!', 'success');
        }
    } catch (error) {
        showToast('Hata: ' + error.message, 'error');
        document.body.classList.remove('connecting', 'connected');
    } finally {
        await fetchStatus();
    }
}

// ==========================================
// DNS TEST
// ==========================================
async function dnsTest() {
    const domain = el.testDomain.value.trim();
    if (!domain) { showToast('Domain girin!', 'warning'); return; }

    el.btnDnsTest.disabled = true;
    el.btnDnsTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    el.dnsTestResult.className = 'dns-result';
    el.dnsTestResult.classList.remove('hidden', 'error');
    el.dnsTestResult.textContent = 'Çözümleniyor...';

    try {
        const type = el.testType.value;
        const res = await fetch(`${API}/api/dns/resolve?domain=${encodeURIComponent(domain)}&type=${type}`);
        const data = await res.json();

        if (data.error) {
            el.dnsTestResult.classList.add('error');
            el.dnsTestResult.textContent = 'Hata: ' + data.error;
        } else {
            const ips = data.answers.map(a => a.address || a.type).filter(Boolean);
            el.dnsTestResult.textContent = [
                `Domain  : ${data.domain}`,
                `Tip     : ${data.type}`,
                `Sağlayıcı: ${data.provider}`,
                `Süre    : ${data.responseTime} ms`,
                `Yanıt   : ${ips.length > 0 ? ips.join(', ') : '(yanıt yok)'}`,
            ].join('\n');
        }
    } catch (e) {
        el.dnsTestResult.classList.add('error');
        el.dnsTestResult.textContent = 'Sunucuya ulaşılamadı.';
    } finally {
        el.btnDnsTest.disabled = false;
        el.btnDnsTest.innerHTML = '<i class="fa-solid fa-play"></i> Test Et';
    }
}

// ==========================================
// LOG TABLE
// ==========================================
function appendLogRow(entry) {
    const tbody = el.logTbody;

    // Ilk log gelince bos satiri kaldir
    const emptyRow = tbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();

    // Max satir kontrolu
    while (tbody.children.length >= state.maxLogRows) {
        tbody.removeChild(tbody.lastChild);
    }

    const tr = document.createElement('tr');
    const statusClass = entry.cached ? 'cache' : entry.status === 'failed' ? 'fail' : 'ok';
    const statusText = entry.cached ? 'Önbellekten' : entry.status === 'failed' ? 'Başarısız' : 'Başarılı';
    const shortDomain = entry.domain.length > 35 ? entry.domain.substring(0, 35) + '...' : entry.domain;

    tr.innerHTML = `
        <td style="color:var(--text-muted);font-size:0.78rem;">${entry.id || ++state.logCount}</td>
        <td class="td-domain" title="${entry.domain}">${shortDomain}</td>
        <td class="td-type">${entry.type}</td>
        <td class="td-time">${entry.responseTime || 0} ms</td>
        <td class="td-provider">${entry.provider || '--'}</td>
        <td><span class="tag ${statusClass}">${statusText}</span></td>
    `;

    tbody.insertBefore(tr, tbody.firstChild);
}

// ==========================================
// HELPERS
// ==========================================
function formatUptime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-xmark-circle', info: 'fa-info-circle', warning: 'fa-triangle-exclamation' };
    toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 350); }, 3500);
}

function showAdminError() {
    // Varsa onceki modali kaldir
    const existing = document.getElementById('admin-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'admin-modal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);animation:fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="
            background:linear-gradient(135deg,rgba(18,22,40,0.98),rgba(30,20,50,0.98));
            border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:2.5rem;max-width:480px;width:90%;
            box-shadow:0 25px 60px rgba(0,0,0,0.6),0 0 40px rgba(239,68,68,0.1);
        ">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                <div style="width:48px;height:48px;border-radius:12px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:#ef4444;flex-shrink:0;">
                    <i class="fa-solid fa-shield-exclamation"></i>
                </div>
                <div>
                    <h3 style="font-size:1.1rem;font-weight:700;color:#f1f5f9;margin-bottom:0.2rem;">Yönetici Yetkisi Gerekli</h3>
                    <p style="font-size:0.8rem;color:#64748b;">WireGuard VPN sistem servisi</p>
                </div>
            </div>
            <p style="color:#94a3b8;font-size:0.9rem;line-height:1.7;margin-bottom:1.5rem;">
                VPN tüneli başlatmak için uygulamanın <strong style="color:#f1f5f9;">Yönetici (Administrator)</strong> 
                olarak çalıştırılması gerekiyor. WireGuard, Windows çekirdeğine erişim gerektiren bir ağ servisi kuruyor.
            </p>
            <div style="background:rgba(0,0,0,0.3);border-radius:12px;padding:1rem;margin-bottom:1.5rem;border:1px solid rgba(255,255,255,0.06);">
                <p style="font-size:0.8rem;color:#64748b;margin-bottom:0.6rem;text-transform:uppercase;letter-spacing:1px;">Çözüm</p>
                <ol style="color:#94a3b8;font-size:0.85rem;line-height:1.9;padding-left:1.2rem;">
                    <li>Terminali (PowerShell / CMD) kapatın</li>
                    <li>Terminal simgesine <strong style="color:#f1f5f9;">sağ tıklayın</strong></li>
                    <li><strong style="color:#6366f1;">"Yönetici olarak çalıştır"</strong> seçin</li>
                    <li><code style="background:rgba(99,102,241,0.15);padding:0.1rem 0.4rem;border-radius:4px;color:#a5b4fc;">npm start</code> komutunu tekrar çalıştırın</li>
                </ol>
            </div>
            <button onclick="document.getElementById('admin-modal').remove()" style="
                width:100%;padding:0.75rem;border:none;border-radius:10px;cursor:pointer;
                background:linear-gradient(135deg,#6366f1,#3b82f6);color:white;font-size:0.9rem;font-weight:600;font-family:inherit;
                transition:opacity 0.2s;
            " onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                <i class="fa-solid fa-check"></i> Anladım
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ==========================================
// START
// ==========================================
document.addEventListener('DOMContentLoaded', init);
