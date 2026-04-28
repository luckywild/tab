class CacheManager {
  constructor(api) {
    this.api = api;
    this.uuidCache = new Map();
    this.playerStatsCache = new Map();
    this.urchinTagsCache = new Map();
    this.seraphTagsCache = new Map();
    this.bordicWinstreakCache = new Map();
    this.bordicPingCache = new Map();
    this.NEGATIVE_TAG_TTL_MS = 120000;
  }

  getUuid(playerName) {
    const cached = this.uuidCache.get(playerName.toLowerCase());
    if (!cached) return null;

    if (Date.now() - cached.timestamp > 3600000) {
      this.uuidCache.delete(playerName.toLowerCase());
      return null;
    }

    return cached.value;
  }

  setUuid(playerName, uuid) {
    this.uuidCache.set(playerName.toLowerCase(), {
      value: uuid,
      timestamp: Date.now(),
    });
  }

  getPlayerStats(playerName) {
    const cached = this.playerStatsCache.get(playerName.toLowerCase());
    if (!cached) return null;

    const configuredTtlSec = Number(this.api.config.get("api.hypixel.ttl"));
    const ttl =
      (Number.isFinite(configuredTtlSec) && configuredTtlSec > 0
        ? configuredTtlSec
        : 300) * 1000;
    if (Date.now() - cached.timestamp > ttl) {
      this.playerStatsCache.delete(playerName.toLowerCase());
      return null;
    }

    return cached.value;
  }

  setPlayerStats(playerName, stats) {
    this.playerStatsCache.set(playerName.toLowerCase(), {
      value: stats,
      timestamp: Date.now(),
    });
  }

  getUrchinTags(playerName) {
    const cached = this.urchinTagsCache.get(playerName.toLowerCase());
    if (!cached) return null;

    const configuredTtlSec = Number(this.api.config.get("api.urchin.ttl"));
    const positiveTtlMs =
      (Number.isFinite(configuredTtlSec) && configuredTtlSec > 0
        ? configuredTtlSec
        : 1800) * 1000;
    const ttl = cached.isNegative ? this.NEGATIVE_TAG_TTL_MS : positiveTtlMs;
    if (Date.now() - cached.timestamp > ttl) {
      this.urchinTagsCache.delete(playerName.toLowerCase());
      return null;
    }

    return cached.value;
  }

  setUrchinTags(playerName, tags) {
    const isNegative = Array.isArray(tags) && tags.length === 0;
    this.urchinTagsCache.set(playerName.toLowerCase(), {
      value: tags,
      timestamp: Date.now(),
      isNegative,
    });
  }

  getSeraphTags(playerName) {
    const cached = this.seraphTagsCache.get(playerName.toLowerCase());
    if (!cached) return null;

    const configuredTtlSec = Number(this.api.config.get("api.seraph.ttl"));
    const positiveTtlMs =
      (Number.isFinite(configuredTtlSec) && configuredTtlSec > 0
        ? configuredTtlSec
        : 1800) * 1000;
    const ttl = cached.isNegative ? this.NEGATIVE_TAG_TTL_MS : positiveTtlMs;
    if (Date.now() - cached.timestamp > ttl) {
      this.seraphTagsCache.delete(playerName.toLowerCase());
      return null;
    }

    return cached.value;
  }

  setSeraphTags(playerName, tags) {
    const isNegative = Array.isArray(tags) && tags.length === 0;
    this.seraphTagsCache.set(playerName.toLowerCase(), {
      value: tags,
      timestamp: Date.now(),
      isNegative,
    });
  }

  getBordicWinstreak(uuid) {
    if (!uuid) return null;
    const key = String(uuid).toLowerCase();
    const cached = this.bordicWinstreakCache.get(key);
    if (!cached) return null;

    const ttl = (Number(this.api.config.get("api.bordic.ttl")) || 1800) * 1000;
    if (Date.now() - cached.timestamp > ttl) {
      this.bordicWinstreakCache.delete(key);
      return null;
    }

    return cached.value;
  }

  setBordicWinstreak(uuid, winstreak) {
    if (!uuid) return;
    const key = String(uuid).toLowerCase();
    this.bordicWinstreakCache.set(key, {
      value: winstreak,
      timestamp: Date.now(),
    });
  }

  getBordicPing(uuid) {
    if (!uuid) return null;
    const key = String(uuid).toLowerCase();
    const cached = this.bordicPingCache.get(key);
    if (!cached) return null;

    const ttl = (Number(this.api.config.get("api.bordic.ttl")) || 1800) * 1000;
    if (Date.now() - cached.timestamp > ttl) {
      this.bordicPingCache.delete(key);
      return null;
    }

    return cached.value;
  }

  setBordicPing(uuid, ping) {
    if (!uuid) return;
    const key = String(uuid).toLowerCase();
    this.bordicPingCache.set(key, {
      value: ping,
      timestamp: Date.now(),
    });
  }

  clearAll() {
    this.uuidCache.clear();
    this.playerStatsCache.clear();
    this.urchinTagsCache.clear();
    this.seraphTagsCache.clear();
    this.bordicWinstreakCache.clear();
    this.bordicPingCache.clear();
  }
}

module.exports = CacheManager;
