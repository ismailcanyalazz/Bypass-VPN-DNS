/**
 * VPN Manager v2 - WireGuard WARP
 * Gelismis hata yakalama ve admin kontrol
 */
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

class VpnManager {
  constructor(logger) {
    this.logger = logger;
    this.vpnDir = path.join(__dirname, '..', 'bin', 'vpn');
    this.wgcfExe = path.join(this.vpnDir, 'wgcf.exe');
    this.installerExe = path.join(this.vpnDir, 'wireguard-installer.exe');
    this.wgExe = 'C:\\Program Files\\WireGuard\\wireguard.exe';
    this.confPath = path.join(this.vpnDir, 'warp.conf');

    this.isRunning = false;
    this.startTime = null;
    this.statusMessage = 'Bekleniyor...';
  }

  isWireGuardInstalled() {
    return fs.existsSync(this.wgExe);
  }

  /**
   * Yonetici yetkisi var mi kontrol et
   */
  async isAdmin() {
    try {
      const { stdout } = await execAsync('net session', { windowsHide: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * WireGuard kur
   */
  async installWireGuard() {
    this.statusMessage = 'WireGuard kuruluyor...';
    if (!fs.existsSync(this.installerExe)) {
      throw new Error('wireguard-installer.exe bulunamadi!');
    }
    try {
      await execFileAsync(this.installerExe, ['/S'], { windowsHide: true, timeout: 60000 });
      for (let i = 0; i < 30; i++) {
        if (this.isWireGuardInstalled()) {
          console.log('WireGuard kuruldu.');
          return;
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw new Error('Kurulum zaman asimina ugradi.');
    } catch (error) {
      throw new Error(`WireGuard kurulumu basarisiz: ${error.message}`);
    }
  }

  /**
   * WARP profili olustur
   */
  async generateWarpProfile() {
    this.statusMessage = 'WARP profili kontrol ediliyor...';
    if (fs.existsSync(this.confPath)) {
      console.log('WARP profili mevcut.');
      return;
    }
    this.statusMessage = 'Cloudflare WARP hesabi olusturuluyor...';
    try {
      await execFileAsync(this.wgcfExe, ['register', '--accept-tos'], { cwd: this.vpnDir, windowsHide: true, timeout: 30000 });
      this.statusMessage = 'VPN profili olusturuluyor...';
      await execFileAsync(this.wgcfExe, ['generate'], { cwd: this.vpnDir, windowsHide: true, timeout: 30000 });
      const generated = path.join(this.vpnDir, 'wgcf-profile.conf');
      if (fs.existsSync(generated)) {
        fs.renameSync(generated, this.confPath);
        console.log('WARP profili olusturuldu.');
      } else {
        throw new Error('wgcf profil dosyasi olusturulamadi.');
      }
    } catch (error) {
      throw new Error(`WARP profili olusturulamadi: ${error.message}`);
    }
  }

  /**
   * Tunel servisi durumunu kontrol et (PowerShell ile)
   */
  async checkTunnelStatus() {
    try {
      const { stdout } = await execAsync(
        'powershell -NonInteractive -Command "Get-Service -Name \'WireGuardTunnel$warp\' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status"',
        { windowsHide: true, timeout: 5000 }
      );
      return stdout.trim() === 'Running';
    } catch (e) {
      return false;
    }
  }

  /**
   * VPN Baslat
   */
  async start() {
    if (this.isRunning) {
      return { success: true, message: 'VPN zaten calisiyor.' };
    }

    // Admin kontrol
    const admin = await this.isAdmin();
    if (!admin) {
      this.statusMessage = 'Yonetici yetkisi gerekli';
      throw new Error(
        'VPN baslatmak icin uygulamanin Yonetici olarak calistirilmasi gerekiyor.\n' +
        'Lutfen terminali "Yonetici olarak calistir" ile acip tekrar deneyin.'
      );
    }

    try {
      if (!this.isWireGuardInstalled()) {
        await this.installWireGuard();
      }
      await this.generateWarpProfile();

      this.statusMessage = 'VPN tuneli aciliyor...';
      console.log(this.statusMessage);

      // Once varsa kapat
      try {
        await execFileAsync(this.wgExe, ['/uninstalltunnelservice', 'warp'], { windowsHide: true, timeout: 8000 });
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) { /* zaten kapali */ }

      // Yeni tunel yukle
      const { stdout: installOut, stderr: installErr } = await execAsync(
        `"${this.wgExe}" /installtunnelservice "${this.confPath}"`,
        { windowsHide: true, timeout: 15000 }
      );

      if (installErr && installErr.toLowerCase().includes('error')) {
        throw new Error(`WireGuard hatasi: ${installErr.trim()}`);
      }

      // Servisin baslamasini bekle (maks 10 sn)
      let active = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 1000));
        active = await this.checkTunnelStatus();
        if (active) break;
      }

      if (active) {
        this.isRunning = true;
        this.startTime = Date.now();
        this.statusMessage = 'Baglandi';
        console.log('VPN Tuneli Aktif!');
        return { success: true, message: 'VPN basariyla baglandi! Tum trafik Cloudflare uzerinden gecyor.' };
      } else {
        // Son caret: olay gunlugunu oku
        let evtMsg = '';
        try {
          const { stdout } = await execAsync(
            'powershell -NonInteractive -Command "Get-WinEvent -LogName System -MaxEvents 5 | Where-Object { $_.Message -like \'*WireGuard*\' } | Select-Object -First 1 -ExpandProperty Message"',
            { windowsHide: true, timeout: 5000 }
          );
          evtMsg = stdout.trim();
        } catch (e) {}
        throw new Error(
          'WireGuard servisi baslatilmadı.' +
          (evtMsg ? `\nOlay Gunlugu: ${evtMsg.substring(0, 120)}` : ' Tam yetkiyle calistirdiginizdan emin olun.')
        );
      }

    } catch (error) {
      this.statusMessage = 'Hata';
      console.error('VPN Baslama Hatasi:', error.message);
      throw error;
    }
  }

  /**
   * VPN Durdur
   */
  async stop() {
    this.statusMessage = 'Baglanti kesiliyor...';
    try {
      await execFileAsync(this.wgExe, ['/uninstalltunnelservice', 'warp'], { windowsHide: true, timeout: 10000 });
      this.isRunning = false;
      this.startTime = null;
      this.statusMessage = 'Baglanti Kesildi';
      console.log('VPN Tuneli Kapatildi.');
      return { success: true, message: 'VPN baglantisi kesildi.' };
    } catch (error) {
      this.isRunning = false;
      this.statusMessage = 'Baglanti Kesildi';
      return { success: true, message: 'VPN zaten kapali.' };
    }
  }

  /**
   * Durum
   */
  getStatus() {
    const uptime = this.isRunning && this.startTime
      ? Math.floor((Date.now() - this.startTime) / 1000)
      : 0;
    return {
      running: this.isRunning,
      statusMessage: this.statusMessage,
      uptimeSeconds: uptime
    };
  }
}

module.exports = VpnManager;
