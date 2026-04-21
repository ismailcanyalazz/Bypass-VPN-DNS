/**
 * DNS Proxy - Yerel DNS sunucusu + DoH yönlendirme
 */
const dns2 = require('dns2');
const { Packet } = dns2;
const { DohClient } = require('./doh-client');
const DnsCache = require('./dns-cache');

class DnsProxy {
  constructor(logger, options = {}) {
    this.port = options.port || 53;
    this.logger = logger;
    this.dohClient = new DohClient(options.provider || 'cloudflare');
    this.cache = new DnsCache(options.cacheTTL || 300);
    this.server = null;
    this.running = false;
  }

  /**
   * DNS sunucusunu başlat
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = dns2.createServer({
        udp: true,
        handle: async (request, send, rinfo) => {
          await this._handleRequest(request, send, rinfo);
        }
      });

      this.server.on('requestError', (error) => {
        console.error('DNS istek hatası:', error.message);
      });

      this.server.on('listening', () => {
        this.running = true;
        console.log(`🛡️  DNS Proxy dinleniyor: 127.0.0.1:${this.port}`);
        resolve();
      });

      this.server.on('close', () => {
        this.running = false;
      });

      try {
        this.server.listen({
          udp: {
            port: this.port,
            address: '127.0.0.1',
            type: 'udp4'
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * DNS isteğini işle
   */
  async _handleRequest(request, send, rinfo) {
    const question = request.questions[0];
    if (!question) return;

    const domain = question.name;
    const typeNum = question.type;
    const typeName = this._getTypeName(typeNum);
    const startTime = Date.now();

    try {
      // Önbellekten kontrol
      const cachedAnswers = this.cache.get(domain, typeNum);
      if (cachedAnswers) {
        const response = Packet.createResponseFromRequest(request);
        response.answers = cachedAnswers.map(a => ({
          name: domain,
          type: typeNum,
          class: Packet.CLASS.IN,
          ttl: a.ttl || 300,
          address: a.address
        })).filter(a => a.address);

        send(response);

        this.logger.addQuery({
          domain,
          type: typeName,
          source: rinfo ? rinfo.address : '127.0.0.1',
          provider: this.dohClient.getProvider().name,
          responseTime: Date.now() - startTime,
          cached: true,
          status: 'success',
          answers: cachedAnswers.map(a => a.address).filter(Boolean)
        });
        return;
      }

      // DoH ile çöz
      const result = await this.dohClient.resolve(domain, typeNum);
      const response = Packet.createResponseFromRequest(request);

      // Yanıtları ekle
      if (result.answers && result.answers.length > 0) {
        response.answers = result.answers
          .filter(a => a.address && (a.type === 'A' || a.type === 'AAAA'))
          .map(a => ({
            name: domain,
            type: a.type === 'A' ? Packet.TYPE.A : Packet.TYPE.AAAA,
            class: Packet.CLASS.IN,
            ttl: a.ttl || 300,
            address: a.address
          }));

        // Önbelleğe kaydet
        if (result.answers.length > 0) {
          const minTTL = Math.min(...result.answers.map(a => a.ttl || 300));
          this.cache.set(domain, typeNum, result.answers, minTTL);
        }
      }

      send(response);

      this.logger.addQuery({
        domain,
        type: typeName,
        source: rinfo ? rinfo.address : '127.0.0.1',
        provider: this.dohClient.getProvider().name,
        responseTime: result.responseTime,
        cached: false,
        status: 'success',
        answers: result.answers.map(a => a.address).filter(Boolean)
      });

    } catch (error) {
      console.error(`DNS çözüm hatası [${domain}]:`, error.message);

      // Boş yanıt gönder
      const response = Packet.createResponseFromRequest(request);
      send(response);

      this.logger.addQuery({
        domain,
        type: typeName,
        source: rinfo ? rinfo.address : '127.0.0.1',
        provider: this.dohClient.getProvider().name,
        responseTime: Date.now() - startTime,
        cached: false,
        status: 'failed',
        answers: []
      });
    }
  }

  /**
   * Sorgu tipini string'e çevir
   */
  _getTypeName(type) {
    const types = {
      1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA',
      15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV',
      255: 'ANY', 65: 'HTTPS'
    };
    return types[type] || `TYPE${type}`;
  }

  /**
   * DoH sağlayıcısını değiştir
   */
  setProvider(providerKey) {
    this.dohClient.setProvider(providerKey);
    console.log(`🔄 DoH sağlayıcı değiştirildi: ${this.dohClient.getProvider().name}`);
  }

  /**
   * Durum bilgisi
   */
  getStatus() {
    return {
      running: this.running,
      port: this.port,
      provider: this.dohClient.getProvider(),
      cache: this.cache.getStats()
    };
  }

  /**
   * Sunucuyu durdur
   */
  async stop() {
    if (this.server) {
      this.server.close();
      this.cache.destroy();
      this.running = false;
      console.log('DNS Proxy durduruldu.');
    }
  }
}

module.exports = DnsProxy;
