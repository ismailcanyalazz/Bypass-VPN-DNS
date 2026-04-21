/**
 * BypassDNS - Ana Sunucu
 * DNS Proxy + Web Dashboard
 */
const express = require('express');
const path = require('path');
const DnsProxy = require('./src/dns-proxy');
const Logger = require('./src/logger');
const VpnManager = require('./src/vpn-manager');
const cors = require('cors');

const app = express();
const WEB_PORT = 3000;
const DNS_PORT = 53;

// Bileşenleri başlat
const logger = new Logger(500);
const vpnManager = new VpnManager(logger);

// Middleware
app.use(cors({
  origin: '*', // Vercel'den gelen isteklere izin ver
  methods: ['GET', 'POST', 'DELETE']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// API Endpoints
// ============================

/**
 * Genel durum
 */
app.get('/api/status', async (req, res) => {
  try {
    const loggerStats = logger.getStats();
    const vpnStatus = vpnManager.getStatus();

    res.json({
      stats: loggerStats,
      vpn: vpnStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DNS logları
 */
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(logger.getLogs(limit));
});

/**
 * Logları temizle
 */
app.delete('/api/logs', (req, res) => {
  logger.clearLogs();
  res.json({ success: true, message: 'Loglar temizlendi' });
});

/**
 * SSE - Canlı log akışı
 */
app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  logger.addSSEClient(res);

  req.on('close', () => {
    // Client disconnected - logger handles cleanup
  });
});

/**
 * DoH sağlayıcılarını listele
 */
app.get('/api/providers', (req, res) => {
  const providers = DOH_PROVIDERS;
  const current = dnsProxy.dohClient.getProvider();
  res.json({ providers, current: current.key });
});

/**
 * DoH sağlayıcısını değiştir
 */
app.post('/api/providers/:key', (req, res) => {
  try {
    dnsProxy.setProvider(req.params.key);
    const provider = dnsProxy.dohClient.getProvider();
    res.json({ success: true, provider });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * VPN Tünelini Başlat
 */
app.post('/api/vpn/start', async (req, res) => {
  try {
    const result = await vpnManager.start();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * VPN Tünelini Durdur
 */
app.post('/api/vpn/stop', async (req, res) => {
  try {
    const result = await vpnManager.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================
// Sunucuyu Başlat
// ============================

async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🛡️  BypassDNS v2.0                   ║');
  console.log('║     WireGuard WARP VPN Proxy             ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // Web Dashboard'u başlat
  app.listen(WEB_PORT, () => {
    console.log(`🌐 Dashboard: http://localhost:${WEB_PORT}`);
    console.log('');
    console.log('📋 Kullanım:');
    console.log(`   1. Tarayıcıda http://localhost:${WEB_PORT} adresini açın`);
    console.log('   2. "DNS Aktif Et" butonuna tıklayın');
    console.log('   3. Discord\'u açın ve keyfini çıkarın! 🎮');
    console.log('');
    console.log('⏹️  Durdurmak için: Ctrl+C');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Kapatılıyor...');
  await vpnManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await vpnManager.stop();
  process.exit(0);
});

start().catch(console.error);
