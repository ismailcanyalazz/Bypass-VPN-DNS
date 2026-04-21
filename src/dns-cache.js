/**
 * DNS Cache - TTL tabanlı in-memory DNS önbellekleme
 */
class DnsCache {
  constructor(defaultTTL = 300) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL; // saniye
    this.stats = {
      hits: 0,
      misses: 0,
      entries: 0
    };

    // Her 60 saniyede süresi dolmuş kayıtları temizle
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Cache anahtarı oluştur
   */
  _makeKey(name, type) {
    return `${name.toLowerCase()}:${type}`;
  }

  /**
   * Cache'e kayıt ekle
   */
  set(name, type, answers, ttl) {
    const key = this._makeKey(name, type);
    const effectiveTTL = ttl || this.defaultTTL;

    this.cache.set(key, {
      answers,
      expires: Date.now() + (effectiveTTL * 1000),
      createdAt: Date.now(),
      ttl: effectiveTTL
    });

    this.stats.entries = this.cache.size;
  }

  /**
   * Cache'den kayıt oku
   */
  get(name, type) {
    const key = this._makeKey(name, type);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // TTL süresi dolmuş mu?
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.stats.entries = this.cache.size;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.answers;
  }

  /**
   * Süresi dolmuş kayıtları temizle
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    this.stats.entries = this.cache.size;
    return cleaned;
  }

  /**
   * Tüm cache'i temizle
   */
  clear() {
    this.cache.clear();
    this.stats.entries = 0;
  }

  /**
   * İstatistikleri döndür
   */
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0
        ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Kapatma
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

module.exports = DnsCache;
