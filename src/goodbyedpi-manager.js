/**
 * GoodbyeDPI Manager
 * Orijinal goodbyedpi.exe sürecini Node.js üzerinden yönetir
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class GoodbyeDpiManager {
  constructor(logger) {
    this.process = null;
    this.logger = logger;
    this.exePath = path.join(__dirname, '..', 'bin', 'goodbyedpi', 'goodbyedpi.exe');
    this.isRunning = false;
    this.startTime = null;
    this.currentMode = '-5'; // Varsayılan agresif mod
  }

  /**
   * GoodbyeDPI çalıştırılabilir dosyasının varlığını kontrol et
   */
  checkExecutable() {
    return fs.existsSync(this.exePath);
  }

  /**
   * GoodbyeDPI'ı başlat
   * @param {string} mode - Örn: '-1', '-5', vb.
   * @param {string} dnsIp - Yönlendirilecek DNS IP'si (örn: '1.1.1.1' veya '127.0.0.1')
   */
  async start(mode = '-5', dnsIp = '127.0.0.1') {
    if (this.isRunning) {
      return { success: true, message: 'GoodbyeDPI zaten çalışıyor.' };
    }

    if (!this.checkExecutable()) {
      throw new Error('goodbyedpi.exe bulunamadı! Lütfen bin/goodbyedpi klasörünü kontrol edin.');
    }

    this.currentMode = mode;

    return new Promise((resolve, reject) => {
      try {
        // Argümanları hazırla
        // Örn: mode = "-e1 -q" -> args = ["-e1", "-q", "--dns-addr", "127.0.0.1", "--dns-port", "53"]
        const modeArgs = mode.split(' ').filter(m => m.trim() !== '');
        const args = [
          ...modeArgs,
          '--dns-addr', dnsIp,
          '--dns-port', '53'
        ];

        console.log(`🚀 GoodbyeDPI Başlatılıyor: ${this.exePath} ${args.join(' ')}`);

        // Süreci başlat
        this.process = spawn(this.exePath, args, {
          cwd: path.dirname(this.exePath),
          windowsHide: true // Siyah konsol penceresini gizle
        });

        this.isRunning = true;
        this.startTime = Date.now();

        // Stdout'u dinle (sadece loglama amaçlı, dashboard'a göndermiyoruz çok yoğun olur)
        this.process.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output && output.includes('Filter activated')) {
            console.log('✅ GoodbyeDPI Filtresi Aktif!');
            resolve({ success: true, message: 'DPI Atlatma Motoru başarıyla başlatıldı.' });
          }
        });

        // Stderr'i dinle
        this.process.stderr.on('data', (data) => {
          console.error(`[GoodbyeDPI Error]: ${data.toString()}`);
        });

        // Kapanma olayını dinle
        this.process.on('close', (code) => {
          console.log(`🛑 GoodbyeDPI kapandı (Kod: ${code})`);
          this.isRunning = false;
          this.process = null;
        });

        this.process.on('error', (err) => {
          console.error(`❌ GoodbyeDPI başlatılamadı: ${err.message}`);
          this.isRunning = false;
          reject(new Error(`Yönetici yetkisi reddedildi veya dosya eksik: ${err.message}`));
        });

        // Eğer 2 saniye içinde "Filter activated" mesajı gelmezse ama süreç kapanmadıysa başarılı sayalım
        setTimeout(() => {
          if (this.isRunning) {
            resolve({ success: true, message: 'DPI Atlatma Motoru başlatıldı.' });
          }
        }, 2000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * GoodbyeDPI'ı durdur
   */
  async stop() {
    if (!this.isRunning || !this.process) {
      return { success: true, message: 'GoodbyeDPI zaten çalışmıyor.' };
    }

    return new Promise((resolve) => {
      // Windows'ta child_process.kill bazen yetersiz kalabilir, taskkill kullanıyoruz
      const { exec } = require('child_process');
      exec('taskkill /IM goodbyedpi.exe /F', (err) => {
        if (err) {
          // Eğer taskkill başarısız olursa normal kill dene
          try {
            this.process.kill();
          } catch(e) {}
        }
        
        this.isRunning = false;
        this.process = null;
        console.log('🛑 GoodbyeDPI zorla durduruldu.');
        resolve({ success: true, message: 'DPI Atlatma Motoru durduruldu.' });
      });
    });
  }

  /**
   * Durumu getir
   */
  getStatus() {
    const uptime = this.isRunning && this.startTime 
      ? Math.floor((Date.now() - this.startTime) / 1000) 
      : 0;

    return {
      running: this.isRunning,
      mode: this.currentMode,
      uptimeSeconds: uptime
    };
  }
}

module.exports = GoodbyeDpiManager;
