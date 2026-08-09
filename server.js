/**
 * BypassDNS - Ana Sunucu v2.0
 * DNS Proxy + DoH + GoodbyeDPI + WireGuard VPN + Web Dashboard
 */
const express = require('express');
const path = require('path');
const cors = require('cors');

const DnsProxy = require('./src/dns-proxy');
const Logger = require('./src/logger');
const VpnManager = require('./src/vpn-manager');
const GoodbyeDpiManager = require('./src/goodbyedpi-manager');
const { DohClient, DOH_PROVIDERS } = require('./src/doh-client');

const app = express();
const WEB_PORT = process.env.PORT || 3000;

// Bilesenler
const logger = new Logger(500);
const vpnManager = new VpnManager(logger);
const goodbyeDpi = new GoodbyeDpiManager(logger);
const dnsProxy = new DnsProxy(logger, { provider: 'cloudflare' });

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE'] }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Genel Durum
app.get('/api/status', async (req, res) => {
  try {
    const loggerStats = logger.getStats();
    const vpnStatus = vpnManager.getStatus();
    const dpiStatus = goodbyeDpi.getStatus();
    const dnsStatus = dnsProxy.getStatus();
    res.json({
      stats: loggerStats,
      vpn: vpnStatus,
      dpi: dpiStatus,
      dns: dnsStatus,
      server: { uptime: process.uptime(), platform: process.platform, nodeVersion: process.version, memory: process.memoryUsage() }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DNS Loglari
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(logger.getLogs(limit));
});

app.delete('/api/logs', (req, res) => {
  logger.clearLogs();
  res.json({ success: true, message: 'Loglar temizlendi' });
});

// SSE Canli Log Akisi
app.get('/api/logs/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  logger.addSSEClient(res);
  req.on('close', () => {});
});

// DoH Saglayicilar
app.get('/api/providers', (req, res) => {
  const providers = DOH_PROVIDERS;
  const current = dnsProxy.dohClient.getProvider();
  res.json({ providers, current: current.key });
});

app.post('/api/providers/:key', (req, res) => {
  try {
    dnsProxy.setProvider(req.params.key);
    const provider = dnsProxy.dohClient.getProvider();
    res.json({ success: true, provider });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Ping / Latency
app.get('/api/ping', async (req, res) => {
  try {
    const start = Date.now();
    await dnsProxy.dohClient.resolve('example.com', 1);
    const latency = Date.now() - start;
    res.json({ success: true, latency, provider: dnsProxy.dohClient.getProvider().name });
  } catch (error) {
    res.json({ success: false, latency: null, error: error.message });
  }
});

// VPN API
app.post('/api/vpn/start', async (req, res) => {
  try {
    const result = await vpnManager.start();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/vpn/stop', async (req, res) => {
  try {
    const result = await vpnManager.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GoodbyeDPI API
app.post('/api/dpi/start', async (req, res) => {
  try {
    const { mode = '-5', dnsIp = '127.0.0.1' } = req.body;
    const result = await goodbyeDpi.start(mode, dnsIp);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/dpi/stop', async (req, res) => {
  try {
    const result = await goodbyeDpi.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DNS Proxy API
app.post('/api/dns/start', async (req, res) => {
  try {
    if (dnsProxy.running) return res.json({ success: true, message: 'DNS Proxy zaten calisyor.' });
    await dnsProxy.start();
    res.json({ success: true, message: 'DNS Proxy baslatildi.' });
  } catch (error) {
    res.status(500).json({ success: false, message: `DNS Proxy baslatılamadi: ${error.message}` });
  }
});

app.post('/api/dns/stop', async (req, res) => {
  try {
    await dnsProxy.stop();
    res.json({ success: true, message: 'DNS Proxy durduruldu.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/dns/resolve', async (req, res) => {
  const { domain = 'google.com', type = 'A' } = req.query;
  try {
    const result = await dnsProxy.dohClient.lookup(domain, type);
    res.json({ domain, type, answers: result.answers, responseTime: result.responseTime, provider: dnsProxy.dohClient.getProvider().name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sunucuyu Baslat
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     🛡️  BypassDNS v2.0                   ║');
  console.log('║     DNS-over-HTTPS + DPI Bypass          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  try {
    const tunnelRunning = await vpnManager.checkTunnelStatus();
    if (tunnelRunning) {
      vpnManager.isRunning = true;
      vpnManager.startTime = Date.now();
      vpnManager.statusMessage = 'Bagli (Senkronize Edildi)';
      console.log('🔄 Mevcut VPN tuneli tespit edildi.');
    }
  } catch (e) {}

  app.listen(WEB_PORT, () => {
    console.log(`🌐 Dashboard: http://localhost:${WEB_PORT}`);
    console.log('⏹️  Durdurmak icin: Ctrl+C');
  });
}

process.on('SIGINT', async () => {
  console.log('\n🔄 Kapatiliyor...');
  await Promise.allSettled([goodbyeDpi.stop(), vpnManager.stop(), dnsProxy.stop()]);
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await Promise.allSettled([goodbyeDpi.stop(), vpnManager.stop(), dnsProxy.stop()]);
  process.exit(0);
});

start().catch(console.error);
