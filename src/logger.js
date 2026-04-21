/**
 * Logger - DNS sorgu loglama + SSE (Server-Sent Events) akışı
 */
class Logger {
  constructor(maxEntries = 500) {
    this.logs = [];
    this.maxEntries = maxEntries;
    this.sseClients = new Set();
    this.stats = {
      totalQueries: 0,
      blockedQueries: 0,
      cachedResponses: 0,
      failedQueries: 0,
      startTime: Date.now()
    };
  }

  /**
   * DNS sorgu logu ekle
   */
  addQuery(entry) {
    const logEntry = {
      id: ++this.stats.totalQueries,
      timestamp: new Date().toISOString(),
      domain: entry.domain || 'unknown',
      type: entry.type || 'A',
      source: entry.source || 'unknown',
      provider: entry.provider || 'unknown',
      responseTime: entry.responseTime || 0,
      cached: entry.cached || false,
      status: entry.status || 'success', // success, blocked, failed
      answers: entry.answers || []
    };

    // İstatistikleri güncelle
    if (logEntry.cached) this.stats.cachedResponses++;
    if (logEntry.status === 'blocked') this.stats.blockedQueries++;
    if (logEntry.status === 'failed') this.stats.failedQueries++;

    // Log listesine ekle
    this.logs.unshift(logEntry);

    // Maksimum log sayısını aşma
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(0, this.maxEntries);
    }

    // SSE ile bağlı istemcilere gönder
    this._broadcast(logEntry);

    return logEntry;
  }

  /**
   * SSE istemcisi ekle
   */
  addSSEClient(res) {
    this.sseClients.add(res);

    res.on('close', () => {
      this.sseClients.delete(res);
    });

    // İlk bağlantıda mevcut logların son 50'sini gönder
    const recentLogs = this.logs.slice(0, 50).reverse();
    for (const log of recentLogs) {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    }
  }

  /**
   * Tüm SSE istemcilerine mesaj gönder
   */
  _broadcast(data) {
    const message = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of this.sseClients) {
      try {
        client.write(message);
      } catch (err) {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Logları getir
   */
  getLogs(limit = 100) {
    return this.logs.slice(0, limit);
  }

  /**
   * İstatistikleri getir
   */
  getStats() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    return {
      ...this.stats,
      uptime: `${hours}s ${minutes}d ${seconds}sn`,
      uptimeSeconds: uptime,
      connectedClients: this.sseClients.size
    };
  }

  /**
   * Logları temizle
   */
  clearLogs() {
    this.logs = [];
  }
}

module.exports = Logger;
