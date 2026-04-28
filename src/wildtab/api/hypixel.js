class HypixelApi {
  constructor(api, cache, mojangApi, bordicApi = null) {
    this.api = api;
    this.cache = cache;
    this.mojangApi = mojangApi;
    this.bordicApi = bordicApi;
    this.FETCH_RETRY_DELAYS_MS = [500, 1000];
    this.gameResourcesCache = null;
    this.gameResourcesCacheAt = 0;
    this.GAME_RESOURCES_TTL_MS = 6 * 60 * 60 * 1000;
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  shouldRetryStatus(status) {
    return status === 429 || status >= 500;
  }

  isApiDisabledCause(cause) {
    const causeLower = String(cause || "").toLowerCase();
    return causeLower.includes("api") && causeLower.includes("disabled");
  }

  getApiKey() {
    return this.api.config.get("api.hypixel.key");
  }

  async getEstimatedWinstreakByUuid(uuid) {
    if (!this.bordicApi) return null;
    return this.bordicApi.getEstimatedWinstreakByUuid(uuid);
  }

  async getLatestPingByUuid(uuid) {
    if (!this.bordicApi) return null;
    return this.bordicApi.getLatestPingByUuid(uuid);
  }

  canFetchBordicResource() {
    return (
      this.bordicApi &&
      typeof this.bordicApi.isEnabled === "function" &&
      this.bordicApi.isEnabled() === true &&
      typeof this.bordicApi.getApiKey === "function" &&
      !!this.bordicApi.getApiKey()
    );
  }

  async fetchJsonWithRetry(url, apiKey, retryDelays = [500, 1000]) {
    if (!apiKey) return null;

    let lastStatus = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(url, { headers: { "API-Key": apiKey } });
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
      console.error(`[Hypixel API] Repeated HTTP ${lastStatus} for ${url}`);
    }

    return null;
  }

  async fetchJsonResultWithRetry(url, apiKey, retryDelays = [500, 1000]) {
    if (!apiKey) return { ok: false, status: 0, data: null, error: "No API key" };

    let lastStatus = 0;
    let lastError = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(url, { headers: { "API-Key": apiKey } });
        lastStatus = response.status;

        let data = null;
        try {
          data = await response.json();
        } catch (jsonError) {
          data = null;
        }

        if (response.ok) {
          return { ok: true, status: response.status, data, error: null };
        }

        if (!this.shouldRetryStatus(response.status)) {
          return { ok: false, status: response.status, data, error: null };
        }
      } catch (error) {
        lastError = error;
      }

      if (attempt < retryDelays.length) {
        await this.sleep(retryDelays[attempt]);
      }
    }

    return {
      ok: false,
      status: lastStatus,
      data: null,
      error: lastError ? lastError.message : null,
    };
  }

  async fetchPlayerWithRetry(uuid, apiKey) {
    let lastStatus = null;

    for (let attempt = 0; attempt <= this.FETCH_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch(
          `https://api.hypixel.net/v2/player?uuid=${uuid}`,
          { headers: { "API-Key": apiKey } },
        );

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

      if (attempt < this.FETCH_RETRY_DELAYS_MS.length) {
        await this.sleep(this.FETCH_RETRY_DELAYS_MS[attempt]);
      }
    }

    if (lastStatus !== null) {
      console.error(
        `[Hypixel API] Repeated HTTP ${lastStatus} while fetching stats for uuid=${uuid}`,
      );
    }
    return null;
  }

  buildRelevantStatsFromPlayer(uuid, player) {
    const stats = player.stats?.Bedwars || {};
    const finalKills = stats.final_kills_bedwars || 0;
    const finalDeaths = stats.final_deaths_bedwars || 0;
    const wins = stats.wins_bedwars || 0;
    const losses = stats.losses_bedwars || 0;
    const hasWinstreak = Object.prototype.hasOwnProperty.call(stats, "winstreak");
    const rawWinstreak = hasWinstreak ? Number(stats.winstreak) : null;
    let resolvedWinstreak = Number.isFinite(rawWinstreak) ? rawWinstreak : null;
    let winstreakEstimated = false;
    let winstreakPending = false;

    if (resolvedWinstreak === null && wins === 0) {
      resolvedWinstreak = 0;
    }
    if (resolvedWinstreak === null && this.canFetchBordicResource()) {
      winstreakPending = true;
    }

    return {
      isNicked: false,
      uuid: uuid,
      stars: player.achievements?.bedwars_level || 0,
      fkdr: finalKills / Math.max(1, finalDeaths),
      final_kills: finalKills,
      final_deaths: finalDeaths,
      wins: wins,
      losses: losses,
      wl: wins / Math.max(1, losses),
      beds_broken: stats.beds_broken_bedwars || 0,
      winstreak: resolvedWinstreak,
      winstreakEstimated: winstreakEstimated,
      winstreakPending: winstreakPending,
      ping: null,
      pingPending: this.canFetchBordicResource(),
    };
  }

  async getPlayerCoreStats(playerName) {
    const cached = this.cache.getPlayerStats(playerName);
    if (cached) return cached;

    const apiKey = this.getApiKey();
    if (!apiKey) return { isNicked: true, error: "No API key" };

    try {
      const uuid = await this.mojangApi.getUuid(playerName);
      if (!uuid) return { isNicked: true };

      const data = await this.fetchPlayerWithRetry(uuid, apiKey);
      if (!data) return null;
      if (!data.success || !data.player) return { isNicked: true };

      const relevantStats = this.buildRelevantStatsFromPlayer(uuid, data.player);

      this.cache.setPlayerStats(playerName, relevantStats);
      return relevantStats;
    } catch (error) {
      console.error(
        `[Hypixel API] Failed to fetch core stats for ${playerName}: ${error.message}`,
      );
      return null;
    }
  }

  async resolveDeferredStats(playerName, stats) {
    if (!stats || stats.isNicked || !stats.uuid) return stats;

    const nextStats = { ...stats };
    const pendingTasks = [];

    if (nextStats.pingPending === true) {
      pendingTasks.push((async () => {
        const latestPing = await this.getLatestPingByUuid(nextStats.uuid);
        nextStats.ping = Number.isFinite(latestPing) ? latestPing : null;
        nextStats.pingPending = false;
      })());
    }

    if (nextStats.winstreakPending === true) {
      pendingTasks.push((async () => {
        const estimatedWinstreak = await this.getEstimatedWinstreakByUuid(nextStats.uuid);
        if (Number.isFinite(estimatedWinstreak)) {
          nextStats.winstreak = estimatedWinstreak;
          nextStats.winstreakEstimated = true;
        } else {
          nextStats.winstreak = null;
          nextStats.winstreakEstimated = false;
        }
        nextStats.winstreakPending = false;
      })());
    }

    if (pendingTasks.length === 0) return nextStats;

    try {
      await Promise.all(pendingTasks);
    } catch (error) {
      console.error(
        `[Hypixel API] Failed to fetch deferred stats for ${playerName}: ${error.message}`,
      );
      nextStats.pingPending = false;
      nextStats.winstreakPending = false;
    }

    this.cache.setPlayerStats(playerName, nextStats);
    return nextStats;
  }

  async getPlayerStats(playerName) {
    const coreStats = await this.getPlayerCoreStats(playerName);
    if (!coreStats || coreStats.isNicked) return coreStats;
    return this.resolveDeferredStats(playerName, coreStats);
  }

  async getPlayerStatusByUuid(uuid) {
    const status = await this.getPlayerStatusResultByUuid(uuid);
    if (!status.trackable) return null;
    return status.session;
  }

  async getPlayerStatusResultByUuid(uuid) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        trackable: false,
        apiDisabled: true,
        error: "No Hypixel API key configured",
        session: null,
      };
    }

    const response = await this.fetchJsonResultWithRetry(
      `https://api.hypixel.net/v2/status?uuid=${uuid}`,
      apiKey,
      [300, 700],
    );

    if (response.ok && response.data?.success === true) {
      const session = response.data.session || {};
      return {
        trackable: true,
        apiDisabled: false,
        error: null,
        session: {
          online: session.online === true,
          gameType: session.gameType || null,
          mode: session.mode || null,
          map: session.map || null,
        },
      };
    }

    const cause =
      response.data?.cause ||
      response.error ||
      (response.status ? `HTTP ${response.status}` : "Unknown error");
    const apiDisabled = this.isApiDisabledCause(cause);

    return {
      trackable: false,
      apiDisabled,
      error: cause,
      session: null,
    };
  }

  async getRecentGamesResultByUuid(uuid) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        trackable: false,
        apiDisabled: true,
        error: "No Hypixel API key configured",
        games: [],
      };
    }

    const response = await this.fetchJsonResultWithRetry(
      `https://api.hypixel.net/v2/recentgames?uuid=${uuid}`,
      apiKey,
      [300, 700],
    );

    if (response.ok && response.data?.success === true) {
      const games = Array.isArray(response.data.games) ? response.data.games : [];
      return {
        trackable: true,
        apiDisabled: false,
        error: null,
        games,
      };
    }

    const cause =
      response.data?.cause ||
      response.error ||
      (response.status ? `HTTP ${response.status}` : "Unknown error");

    return {
      trackable: false,
      apiDisabled: this.isApiDisabledCause(cause),
      error: cause,
      games: [],
    };
  }

  async probeTrackingCapabilitiesByUuid(uuid) {
    const [status, recentGames] = await Promise.all([
      this.getPlayerStatusResultByUuid(uuid),
      this.getRecentGamesResultByUuid(uuid),
    ]);

    return {
      statusAvailable: status.trackable === true,
      recentGamesAvailable: recentGames.trackable === true,
      status,
      recentGames,
    };
  }

  async getRecentGamesByUuid(uuid) {
    const result = await this.getRecentGamesResultByUuid(uuid);
    if (!result.trackable) return [];
    return result.games;
  }

  humanizeToken(value) {
    if (!value) return null;
    return String(value)
      .toLowerCase()
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  async getGameResources() {
    const now = Date.now();
    if (
      this.gameResourcesCache &&
      now - this.gameResourcesCacheAt < this.GAME_RESOURCES_TTL_MS
    ) {
      return this.gameResourcesCache;
    }

    const apiKey = this.getApiKey();
    if (!apiKey) return this.gameResourcesCache || {};

    const data = await this.fetchJsonWithRetry(
      "https://api.hypixel.net/v2/resources/games",
      apiKey,
      [500, 1000],
    );

    if (data?.success && data.games) {
      this.gameResourcesCache = data.games;
      this.gameResourcesCacheAt = now;
    }

    return this.gameResourcesCache || {};
  }

  async getGameAndModeLabel(gameType, mode) {
    const resources = await this.getGameResources();
    const gameEntry = resources?.[gameType] || null;

    const gameLabel = gameEntry?.name || this.humanizeToken(gameType) || "Unknown";
    const modeLabel =
      (mode && gameEntry?.modeNames?.[mode]) || this.humanizeToken(mode) || null;

    return { gameLabel, modeLabel };
  }

}

module.exports = HypixelApi;
