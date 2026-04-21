/**
 * VPN Manager
 * WireGuard ve Cloudflare WARP (wgcf) süreçlerini otomatik yönetir.
 */
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const execAsync = util.promisify(exec);

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

  /**
   * WireGuard kurulu mu kontrol et
   */
  isWireGuardInstalled() {
    return fs.existsSync(this.wgExe);
  }

  /**
   * WireGuard'ı sessizce kur
   */
  async installWireGuard() {
    this.statusMessage = 'WireGuard kuruluyor... Lütfen bekleyin.';
    console.log(this.statusMessage);
    
    if (!fs.existsSync(this.installerExe)) {
      throw new Error('wireguard-installer.exe bulunamadı! İndirme başarısız olmuş olabilir.');
    }

    try {
      // Yükleyiciyi sessiz argümanlarla çalıştır (/S)
      await execAsync(`"${this.installerExe}" /S`, { windowsHide: true });
      
      // Kurulumun tamamlanmasını bekle (max 30 saniye)
      for (let i = 0; i < 30; i++) {
        if (this.isWireGuardInstalled()) {
          console.log('✅ WireGuard başarıyla kuruldu!');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      throw new Error('Kurulum zaman aşımına uğradı.');
    } catch (error) {
      throw new Error(`WireGuard kurulumu başarısız: ${error.message}. Lütfen manuel olarak kurun.`);
    }
  }

  /**
   * wgcf ile Cloudflare WARP profili oluştur
   */
  async generateWarpProfile() {
    this.statusMessage = 'Cloudflare WARP profili kontrol ediliyor...';
    
    if (fs.existsSync(this.confPath)) {
      console.log('✅ WARP profili zaten var.');
      return;
    }

    this.statusMessage = 'Ücretsiz Cloudflare WARP hesabı oluşturuluyor...';
    console.log(this.statusMessage);

    try {
      // 1. Hesap oluştur (register)
      await execAsync(`"${this.wgcfExe}" register --accept-tos`, { cwd: this.vpnDir, windowsHide: true });
      
      this.statusMessage = 'VPN profili oluşturuluyor...';
      
      // 2. Profil oluştur (generate)
      await execAsync(`"${this.wgcfExe}" generate`, { cwd: this.vpnDir, windowsHide: true });
      
      // 3. Dosyayı warp.conf olarak yeniden adlandır
      const generatedConf = path.join(this.vpnDir, 'wgcf-profile.conf');
      if (fs.existsSync(generatedConf)) {
        fs.renameSync(generatedConf, this.confPath);
        console.log('✅ WARP profili başarıyla oluşturuldu!');
      } else {
        throw new Error('wgcf profil dosyasını oluşturamadı.');
      }
    } catch (error) {
      throw new Error(`WARP profili oluşturulamadı: ${error.message}`);
    }
  }

  /**
   * Tünelin çalışıp çalışmadığını Windows Servislerinden kontrol et
   */
  async checkTunnelStatus() {
    try {
      const { stdout } = await execAsync('sc query WireGuardTunnel$warp');
      return stdout.includes('RUNNING');
    } catch (error) {
      return false; // Servis yok veya hata verdi
    }
  }

  /**
   * VPN'i Başlat
   */
  async start() {
    if (this.isRunning) {
      return { success: true, message: 'VPN zaten çalışıyor.' };
    }

    try {
      // 1. WireGuard yüklü değilse yükle
      if (!this.isWireGuardInstalled()) {
        await this.installWireGuard();
      }

      // 2. WARP Profili yoksa oluştur
      await this.generateWarpProfile();

      this.statusMessage = 'VPN Tüneli açılıyor...';
      console.log(this.statusMessage);

      // 3. Tüneli başlat (/installtunnelservice ile başlar)
      try {
        await execAsync(`"${this.wgExe}" /installtunnelservice "${this.confPath}"`, { windowsHide: true });
      } catch (err) {
        // Eğer zaten kuruluysa hata verebilir, yoksay
      }

      // 4. Durumu doğrula
      await new Promise(resolve => setTimeout(resolve, 2000));
      const active = await this.checkTunnelStatus();

      if (active) {
        this.isRunning = true;
        this.startTime = Date.now();
        this.statusMessage = 'Bağlandı';
        console.log('🚀 VPN Tüneli Aktif! Tüm trafik Cloudflare üzerinden geçiyor.');
        return { success: true, message: 'VPN başarıyla bağlandı!' };
      } else {
        throw new Error('WireGuard servisi başlatılamadı.');
      }

    } catch (error) {
      this.statusMessage = 'Hata';
      console.error('❌ VPN Başlatma Hatası:', error.message);
      throw error;
    }
  }

  /**
   * VPN'i Durdur
   */
  async stop() {
    this.statusMessage = 'Bağlantı kesiliyor...';
    try {
      // Tüneli durdur ve servisi kaldır
      await execAsync(`"${this.wgExe}" /uninstalltunnelservice warp`, { windowsHide: true });
      
      this.isRunning = false;
      this.startTime = null;
      this.statusMessage = 'Bağlantı Kesildi';
      console.log('🛑 VPN Tüneli Kapatıldı.');
      return { success: true, message: 'VPN bağlantısı kesildi.' };
    } catch (error) {
      // Zaten kapalıysa
      this.isRunning = false;
      this.statusMessage = 'Bağlantı Kesildi';
      return { success: true, message: 'VPN zaten kapalıydı.' };
    }
  }

  /**
   * Güncel durumu getir
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
