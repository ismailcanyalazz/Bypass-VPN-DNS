/**
 * DoH Client - DNS-over-HTTPS istemcisi
 * DNS sorgularını HTTPS üzerinden şifreleyerek gönderir
 */
const https = require('https');
const { Buffer } = require('buffer');

// DoH Sağlayıcıları
const DOH_PROVIDERS = {
  cloudflare: {
    name: 'Cloudflare',
    url: 'https://cloudflare-dns.com/dns-query',
    ip: '1.1.1.1',
    description: 'Hızlı ve gizlilik odaklı'
  },
  google: {
    name: 'Google',
    url: 'https://dns.google/dns-query',
    ip: '8.8.8.8',
    description: 'Güvenilir ve yaygın'
  },
  quad9: {
    name: 'Quad9',
    url: 'https://dns.quad9.net:5053/dns-query',
    ip: '9.9.9.9',
    description: 'Güvenlik odaklı, zararlı siteleri engeller'
  },
  adguard: {
    name: 'AdGuard',
    url: 'https://dns.adguard-dns.com/dns-query',
    ip: '94.140.14.14',
    description: 'Reklam engelleyici DNS'
  }
};

class DohClient {
  constructor(provider = 'cloudflare') {
    this.setProvider(provider);
  }

  /**
   * DoH sağlayıcısını değiştir
   */
  setProvider(providerKey) {
    if (!DOH_PROVIDERS[providerKey]) {
      throw new Error(`Bilinmeyen DoH sağlayıcı: ${providerKey}`);
    }
    this.currentProvider = providerKey;
    this.providerConfig = DOH_PROVIDERS[providerKey];
  }

  /**
   * Mevcut sağlayıcıyı getir
   */
  getProvider() {
    return {
      key: this.currentProvider,
      ...this.providerConfig
    };
  }

  /**
   * Tüm sağlayıcıları listele
   */
  static getProviders() {
    return DOH_PROVIDERS;
  }

  /**
   * DNS sorgusunu DNS wire format'a çevir (RFC 1035)
   */
  _buildDnsQuery(domain, type = 1) {
    // Transaction ID (2 bytes) - random
    const id = Buffer.alloc(2);
    id.writeUInt16BE(Math.floor(Math.random() * 65535));

    // Flags (2 bytes) - standard query, recursion desired
    const flags = Buffer.from([0x01, 0x00]);

    // Question count (2 bytes)
    const qdcount = Buffer.from([0x00, 0x01]);

    // Answer, Authority, Additional counts (6 bytes) - all zero
    const counts = Buffer.alloc(6);

    // Question section - encode domain name
    const labels = domain.split('.');
    const questionParts = [];
    for (const label of labels) {
      questionParts.push(Buffer.from([label.length]));
      questionParts.push(Buffer.from(label, 'ascii'));
    }
    questionParts.push(Buffer.from([0x00])); // null terminator

    // QTYPE (2 bytes)
    const qtype = Buffer.alloc(2);
    qtype.writeUInt16BE(type);

    // QCLASS (2 bytes) - IN (Internet)
    const qclass = Buffer.from([0x00, 0x01]);

    return Buffer.concat([
      id, flags, qdcount, counts,
      ...questionParts, qtype, qclass
    ]);
  }

  /**
   * DNS wire format yanıtını parse et
   */
  _parseDnsResponse(buffer) {
    const answers = [];

    try {
      // Header
      const qdcount = buffer.readUInt16BE(4);
      const ancount = buffer.readUInt16BE(6);

      // Question section'ı atla
      let offset = 12;
      for (let i = 0; i < qdcount; i++) {
        while (buffer[offset] !== 0) {
          if ((buffer[offset] & 0xc0) === 0xc0) {
            offset += 2;
            break;
          }
          offset += buffer[offset] + 1;
        }
        if (buffer[offset] === 0) offset++;
        offset += 4; // QTYPE + QCLASS
      }

      // Answer section
      for (let i = 0; i < ancount; i++) {
        // Name (compressed veya normal)
        if ((buffer[offset] & 0xc0) === 0xc0) {
          offset += 2;
        } else {
          while (buffer[offset] !== 0) {
            offset += buffer[offset] + 1;
          }
          offset++;
        }

        const type = buffer.readUInt16BE(offset);
        offset += 2;
        offset += 2; // CLASS
        const ttl = buffer.readUInt32BE(offset);
        offset += 4;
        const rdlength = buffer.readUInt16BE(offset);
        offset += 2;

        if (type === 1 && rdlength === 4) {
          // A record
          const ip = `${buffer[offset]}.${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}`;
          answers.push({ type: 'A', address: ip, ttl });
        } else if (type === 28 && rdlength === 16) {
          // AAAA record
          const parts = [];
          for (let j = 0; j < 16; j += 2) {
            parts.push(buffer.readUInt16BE(offset + j).toString(16));
          }
          answers.push({ type: 'AAAA', address: parts.join(':'), ttl });
        } else if (type === 5) {
          // CNAME record
          answers.push({ type: 'CNAME', ttl });
        }

        offset += rdlength;
      }
    } catch (e) {
      // Parse hatası - boş döndür
    }

    return answers;
  }

  /**
   * DoH sorgusu gönder
   */
  async resolve(domain, type = 1) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const dnsQuery = this._buildDnsQuery(domain, type);
      const base64Query = dnsQuery.toString('base64url');

      const url = new URL(this.providerConfig.url);

      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}?dns=${base64Query}`,
        method: 'GET',
        headers: {
          'Accept': 'application/dns-message',
        },
        timeout: 5000
      };

      const req = https.request(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));

        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          const responseBuffer = Buffer.concat(chunks);

          if (res.statusCode !== 200) {
            reject(new Error(`DoH yanıt hatası: ${res.statusCode}`));
            return;
          }

          const answers = this._parseDnsResponse(responseBuffer);

          resolve({
            raw: responseBuffer,
            answers,
            responseTime,
            provider: this.currentProvider
          });
        });
      });

      req.on('error', (err) => {
        reject(new Error(`DoH bağlantı hatası: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('DoH zaman aşımı'));
      });

      req.end();
    });
  }

  /**
   * Domain'i çöz (yüksek seviyeli)
   */
  async lookup(domain, type = 'A') {
    const typeMap = { 'A': 1, 'AAAA': 28, 'CNAME': 5, 'MX': 15, 'TXT': 16, 'NS': 2 };
    const numericType = typeMap[type] || 1;

    return this.resolve(domain, numericType);
  }
}

module.exports = { DohClient, DOH_PROVIDERS };
