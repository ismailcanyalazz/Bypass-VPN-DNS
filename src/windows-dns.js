/**
 * Windows DNS Yönetimi - PowerShell ile DNS ayarlarını oku/değiştir
 */
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class WindowsDns {
  constructor() {
    this.originalDns = null;
    this.activeInterface = null;
  }

  /**
   * PowerShell komutu çalıştır
   */
  async _runPowerShell(command) {
    try {
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -Command "${command.replace(/"/g, '\\"')}"`,
        { timeout: 15000 }
      );
      return stdout.trim();
    } catch (error) {
      throw new Error(`PowerShell hatası: ${error.message}`);
    }
  }

  /**
   * Aktif ağ adaptörünü bul
   */
  async getActiveInterface() {
    try {
      const result = await this._runPowerShell(
        `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1 -ExpandProperty Name`
      );
      this.activeInterface = result;
      return result;
    } catch (error) {
      // Yedek yöntem
      try {
        const result = await this._runPowerShell(
          `Get-NetConnectionProfile | Select-Object -First 1 -ExpandProperty InterfaceAlias`
        );
        this.activeInterface = result;
        return result;
      } catch (e) {
        throw new Error('Aktif ağ adaptörü bulunamadı');
      }
    }
  }

  /**
   * Mevcut DNS ayarlarını oku
   */
  async getCurrentDns() {
    try {
      const interfaceName = await this.getActiveInterface();
      const result = await this._runPowerShell(
        `Get-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses | ConvertTo-Json`
      );

      let addresses = [];
      try {
        const parsed = JSON.parse(result);
        addresses = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        if (result) addresses = [result];
      }

      return {
        interface: interfaceName,
        addresses: addresses.filter(Boolean),
        isProxy: addresses.includes('127.0.0.1')
      };
    } catch (error) {
      return {
        interface: 'Bilinmiyor',
        addresses: [],
        isProxy: false,
        error: error.message
      };
    }
  }

  /**
   * DNS'i yerel proxy'ye yönlendir (127.0.0.1)
   */
  async enableProxy() {
    try {
      // Önce mevcut DNS'i kaydet
      const current = await this.getCurrentDns();
      if (!current.isProxy) {
        this.originalDns = current;
      }

      const interfaceName = current.interface;

      await this._runPowerShell(
        `Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses ('127.0.0.1')`
      );

      // DNS önbelleğini temizle
      await this._runPowerShell('Clear-DnsClientCache');

      console.log(`✅ DNS, 127.0.0.1'e yönlendirildi (${interfaceName})`);

      return {
        success: true,
        interface: interfaceName,
        previousDns: current.addresses,
        message: 'DNS başarıyla proxy\'ye yönlendirildi'
      };
    } catch (error) {
      return {
        success: false,
        message: `DNS değiştirilemedi: ${error.message}. Yönetici olarak çalıştırın.`
      };
    }
  }

  /**
   * DNS'i orijinal ayarlara geri döndür
   */
  async disableProxy() {
    try {
      const interfaceName = await this.getActiveInterface();

      if (this.originalDns && this.originalDns.addresses.length > 0) {
        // Orijinal DNS'e geri dön
        const addresses = this.originalDns.addresses.map(a => `'${a}'`).join(',');
        await this._runPowerShell(
          `Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ServerAddresses (${addresses})`
        );
        console.log(`🔄 DNS orijinal ayarlara döndürüldü: ${this.originalDns.addresses.join(', ')}`);
      } else {
        // DHCP'den otomatik al
        await this._runPowerShell(
          `Set-DnsClientServerAddress -InterfaceAlias '${interfaceName}' -ResetServerAddresses`
        );
        console.log('🔄 DNS ayarları sıfırlandı (DHCP)');
      }

      // DNS önbelleğini temizle
      await this._runPowerShell('Clear-DnsClientCache');

      return {
        success: true,
        message: 'DNS orijinal ayarlara döndürüldü'
      };
    } catch (error) {
      return {
        success: false,
        message: `DNS geri yüklenemedi: ${error.message}. Yönetici olarak çalıştırın.`
      };
    }
  }

  /**
   * Windows DNS önbelleğini temizle
   */
  async flushDnsCache() {
    try {
      await this._runPowerShell('Clear-DnsClientCache');
      return { success: true, message: 'DNS önbelleği temizlendi' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * DNS durumunu getir
   */
  async getStatus() {
    const current = await this.getCurrentDns();
    return {
      ...current,
      originalDns: this.originalDns ? this.originalDns.addresses : null,
      proxyActive: current.isProxy
    };
  }
}

module.exports = WindowsDns;
