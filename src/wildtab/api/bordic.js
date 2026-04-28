class BordicApi {
  constructor(api, cache) {
    this.api = api;
    this.cache = cache;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  shouldRetryStatus(status) {
    return status === 429 || status >= 500;
  }

  isEnabled() {
    return this.api.config.get("api.bordic.enabled") === true;
  }

  getApiKey() {
    const key = this.api.config.get("api.bordic.key");
    return typeof key === "string" ? key.trim() : "";
  }

  normalizeUuidForBordic(uuid) {
    return String(uuid || "").replace(/-/g, "").trim().toLowerCase();
  }

  async fetchJsonWithoutAuthWithRetry(url, retryDelays = [500, 1000], resourceName = "resource") {
    let lastStatus = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return await response.json();
        }

        lastStatus = response.status;
        if (!this.shouldRetryStatus(response.status)) {
          return null;
        }
      } catch (error) {
        // Network/transient failures are retried below.
      }

      if (attempt < retryDelays.length) {
        await this.sleep(retryDelays[attempt]);
      }
    }

    if (lastStatus !== null) {
      console.error(
        `[Bordic API] Repeated HTTP ${lastStatus} while fetching ${resourceName}`,
      );
    }

    return null;
  }

  async getEstimatedWinstreakByUuid(uuid) {
    if (!uuid || !this.isEnabled()) return null;

    const bordicKey = this.getApiKey();
    if (!bordicKey) return null;

    const normalizedUuid = this.normalizeUuidForBordic(uuid);
    if (!normalizedUuid) return null;

    const cached = this.cache?.getBordicWinstreak(normalizedUuid);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const url = `https://bordic.xyz/api/v2/resources/winstreak?uuid=${encodeURIComponent(normalizedUuid)}&key=${encodeURIComponent(bordicKey)}`;
    const data = await this.fetchJsonWithoutAuthWithRetry(url, [400, 800], "estimated winstreak");
    if (!data || data.success !== true) return null;

    const rawWinstreak = Number(data?.data?.winstreak);
    if (!Number.isFinite(rawWinstreak)) return null;

    this.cache?.setBordicWinstreak(normalizedUuid, rawWinstreak);
    return rawWinstreak;
  }

  getLatestPingEntry(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    return entries.reduce((latest, entry) => {
      if (!entry || typeof entry !== "object") return latest;
      if (!latest) return entry;
      const latestTimestamp = Number(latest.timestamp) || 0;
      const entryTimestamp = Number(entry.timestamp) || 0;
      return entryTimestamp > latestTimestamp ? entry : latest;
    }, null);
  }

  async getLatestPingByUuid(uuid) {
    if (!uuid || !this.isEnabled()) return null;

    const bordicKey = this.getApiKey();
    if (!bordicKey) return null;

    const normalizedUuid = this.normalizeUuidForBordic(uuid);
    if (!normalizedUuid) return null;

    const cached = this.cache?.getBordicPing(normalizedUuid);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const url = `https://bordic.xyz/api/v2/resources/ping?uuid=${encodeURIComponent(normalizedUuid)}&key=${encodeURIComponent(bordicKey)}`;
    const data = await this.fetchJsonWithoutAuthWithRetry(url, [400, 800], "ping history");
    if (!data || data.success !== true) return null;

    const latestEntry = this.getLatestPingEntry(data.data);
    const rawPing = Number(latestEntry?.avg);
    if (!Number.isFinite(rawPing)) return null;

    const ping = Math.max(0, Math.round(rawPing));
    this.cache?.setBordicPing(normalizedUuid, ping);
    return ping;
  }
}

module.exports = BordicApi;
