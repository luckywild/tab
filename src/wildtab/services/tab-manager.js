const messages = require("../messages");

class TabManager {
  constructor(
    api,
    hypixelApi,
    tagProviderManager,
    statsFormatter,
    resolveTablistUuidByName = null,
    resolveSelfNames = null,
  ) {
    this.api = api;
    this.hypixelApi = hypixelApi;
    this.tagProviderManager = tagProviderManager;
    this.statsFormatter = statsFormatter;
    this.resolveTablistUuidByName = resolveTablistUuidByName;
    this.resolveSelfNames = resolveSelfNames;
    this.managedPlayers = new Map();
    this.playerData = new Map();
    this.refreshInterval = null;
    this.REFRESH_INTERVAL_MS = 1000;
    this.statsRetryTimers = new Map();
    this.STATS_RETRY_BASE_DELAY_MS = 1500;
    this.STATS_RETRY_MAX_DELAY_MS = 30000;
    this.STATS_RETRY_MAX_ATTEMPTS = 8;
    this.cachedPlayerTeamColors = new Map();
    this.gameTeamColorCache = {
      active: false,
      playerColors: new Map(),
      ownTeamColors: new Set(),
    };
    this.displayState = new Map();
    this.lastAppliedDisplayState = new Map();
    this.displayRefreshTimer = null;
    this.displayRefreshInProgress = false;
    this.displayRefreshQueued = false;
    this.DISPLAY_REFRESH_DEBOUNCE_MS = 100;
  }

  startRefreshInterval() {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      this.heartbeatReapplyDisplayState();
    }, this.REFRESH_INTERVAL_MS);
  }

  stopRefreshInterval() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  heartbeatReapplyDisplayState() {
    this.applyStoredDisplayState({ force: true });
  }

clearManagedPlayers(type = "all") {
    for (const [name, data] of this.managedPlayers.entries()) {
      if (type === "all" || data.type === type) {
        if (data.uuid) {
          this.api.clearDisplayNameSuffix(data.uuid);
          this.api.clearDisplayNamePrefix?.(data.uuid);
          this.lastAppliedDisplayState.delete(data.uuid);
        }
        this.managedPlayers.delete(name);
        this.playerData.delete(name);
        this.displayState.delete(name);
        this.clearStatsRetry(name);
      }
    }
    if (this.managedPlayers.size === 0) {
      this.stopRefreshInterval();
    }
    if (type === "all") {
      for (const retry of this.statsRetryTimers.values()) {
        clearTimeout(retry.timer);
      }
      this.statsRetryTimers.clear();
      this.displayState.clear();
      this.lastAppliedDisplayState.clear();
      this.clearScheduledDisplayRefresh();
    }
  }

  clearCachedTeamColor() {
    this.cachedPlayerTeamColors.clear();
  }

  resetGameTeamColorCache() {
    this.clearCachedTeamColor();
    this.gameTeamColorCache.active = false;
    this.gameTeamColorCache.playerColors.clear();
    this.gameTeamColorCache.ownTeamColors.clear();
  }

  clearScheduledDisplayRefresh() {
    if (!this.displayRefreshTimer) return;
    clearTimeout(this.displayRefreshTimer);
    this.displayRefreshTimer = null;
  }

  clearStatsRetry(playerName) {
    const key = playerName.toLowerCase();
    const retry = this.statsRetryTimers.get(key);
    if (!retry) return;
    clearTimeout(retry.timer);
    this.statsRetryTimers.delete(key);
  }

  scheduleStatsRetry(playerName, options, attempt) {
    const key = playerName.toLowerCase();
    const existing = this.statsRetryTimers.get(key);

    if (attempt > this.STATS_RETRY_MAX_ATTEMPTS) {
      if (existing) {
        clearTimeout(existing.timer);
      }
      this.statsRetryTimers.delete(key);
      return;
    }

    if (existing) {
      clearTimeout(existing.timer);
    }

    const safeAttempt = Math.max(1, attempt);
    const delayMs = Math.min(
      this.STATS_RETRY_MAX_DELAY_MS,
      this.STATS_RETRY_BASE_DELAY_MS * Math.pow(2, safeAttempt - 1),
    );

    const timer = setTimeout(() => {
      const current = this.statsRetryTimers.get(key);
      if (!current || current.timer !== timer) return;

      this.statsRetryTimers.delete(key);

      this.addPlayerStatsToTab(playerName, {
        ...current.options,
        forceRefresh: true,
        retryAttempt: current.attempt,
      });
    }, delayMs);

    this.statsRetryTimers.set(key, {
      timer,
      attempt,
      options,
    });
  }

  calculateMaxWidths() {
    const getVisualLength = (str) => str.replace(/§[0-9a-fk-or]/g, "").length;

    const showStars = this.api.config.get("tab.showStars");
    const showFkdr = this.api.config.get("tab.showFkdr");
    const showWl = this.api.config.get("tab.showWl");
    const showFinals = this.api.config.get("tab.showFinals");
    const showWins = this.api.config.get("tab.showWins");
    const showWs = this.api.config.get("tab.showWs");
    const showPing = this.api.config.get("tab.showPing");

    let maxStarLength = 0;
    let maxFkdrLength = 0;
    let maxWlLength = 0;
    let maxFinalsLength = 0;
    let maxWinsLength = 0;
    let maxWsLength = 0;
    let maxPingLength = 0;

    for (const [, data] of this.playerData.entries()) {
      const { stats } = data;
      const isLoading = !stats || stats.isLoading === true;
      const isNicked = !!stats?.isNicked;

      if (showStars) {
        const starStr = isNicked
          ? "[???✫]"
          : isLoading
            ? "[---✫]"
            : `[${stats.stars}✫]`;
        maxStarLength = Math.max(maxStarLength, getVisualLength(starStr));
      }
      if (showFkdr) {
        const fkdrStr = isNicked ? "?.?" : isLoading ? "-.-" : stats.fkdr.toFixed(1);
        maxFkdrLength = Math.max(maxFkdrLength, fkdrStr.length);
      }
      if (showWl) {
        const wlStr = isNicked ? "?.?" : isLoading ? "-.-" : stats.wl.toFixed(1);
        maxWlLength = Math.max(maxWlLength, wlStr.length);
      }
      if (showFinals) {
        const finalsStr = isNicked
          ? "?"
          : isLoading
            ? "-"
          : `${stats.final_kills}/${stats.final_deaths}`;
        maxFinalsLength = Math.max(maxFinalsLength, getVisualLength(finalsStr));
      }
      if (showWins) {
        const winsStr = isNicked ? "?" : isLoading ? "-" : stats.wins.toString();
        maxWinsLength = Math.max(maxWinsLength, winsStr.length);
      }
      if (showWs) {
        const wsMissing =
          isNicked ||
          isLoading ||
          stats?.winstreak === undefined ||
          stats?.winstreak === null;
        const wsStr = wsMissing
          ? (isNicked ? "?" : "-")
          : this.statsFormatter.formatWinstreakValue(
            stats.winstreak,
            stats?.winstreakEstimated === true,
        );
        maxWsLength = Math.max(maxWsLength, wsStr.length);
      }
      if (showPing) {
        const pingStr = isNicked
          ? "?"
          : isLoading
            ? "-"
            : stats?.pingPending === true
              ? "-"
            : stats?.ping !== undefined && stats?.ping !== null
              ? Math.round(stats.ping).toString()
              : "?";
        maxPingLength = Math.max(maxPingLength, pingStr.length);
      }
    }

    return {
      starMax: maxStarLength,
      fkdrMax: maxFkdrLength,
      wlMax: maxWlLength,
      finalsMax: maxFinalsLength,
      winsMax: maxWinsLength,
      wsMax: maxWsLength,
      pingMax: maxPingLength,
    };
  }

  getColorFromTeamPrefix(prefix) {
    const colorMap = {
      "§c": "§c",
      "§9": "§9",
      "§a": "§a",
      "§e": "§e",
      "§b": "§b",
      "§f": "§f",
      "§d": "§d",
      "§8": "§8",
    };

    for (const [code, color] of Object.entries(colorMap)) {
      if (prefix.includes(code)) return color;
    }
    return null;
  }

  normalizePlayerName(playerName) {
    return String(playerName || "").trim().toLowerCase();
  }

  getLiveTeamColor(playerName) {
    const lowerName = this.normalizePlayerName(playerName);
    if (!lowerName) return null;
    const cached = this.cachedPlayerTeamColors.get(lowerName);
    const teamPrefix = this.getCurrentTeamPrefix(playerName);

    if (!teamPrefix) {
      return cached?.color || null;
    }

    if (cached && cached.prefix === teamPrefix) return cached.color;

    if (this.api.config.get("debug")) {
      this.api.chat(
        messages.utility.prefixedMuted(
          `[DEBUG] getTeamColor(${playerName}) prefix=${teamPrefix}`,
        ),
      );
    }

    const color = this.getColorFromTeamPrefix(teamPrefix);
    if (!color) {
      return cached?.color || null;
    }

    this.cachedPlayerTeamColors.set(lowerName, {
      prefix: teamPrefix,
      color,
    });
    return color;
  }

  getCurrentTeamPrefix(playerName) {
    const team = this.api.getPlayerTeam(playerName);
    return team?.prefix || null;
  }

  getCurrentLiveTeamColor(playerName) {
    const teamPrefix = this.getCurrentTeamPrefix(playerName);
    if (!teamPrefix) return null;
    return this.getColorFromTeamPrefix(teamPrefix);
  }

  cacheGameTeamColors(entries = []) {
    this.clearCachedTeamColor();
    this.gameTeamColorCache.active = true;
    this.gameTeamColorCache.playerColors.clear();
    this.gameTeamColorCache.ownTeamColors.clear();

    for (const entry of entries) {
      const playerName =
        typeof entry === "string"
          ? entry
          : (entry?.playerName || entry?.name || "");
      const lowerName = this.normalizePlayerName(playerName);
      if (!lowerName) continue;

      const teamColor = this.getLiveTeamColor(playerName);
      if (!teamColor) continue;

      this.gameTeamColorCache.playerColors.set(lowerName, teamColor);
      if (entry?.isSelf === true) {
        this.gameTeamColorCache.ownTeamColors.add(teamColor);
      }
    }
  }

  getGameCachedTeamColor(playerName) {
    if (!this.gameTeamColorCache.active) return null;
    const lowerName = this.normalizePlayerName(playerName);
    if (!lowerName) return null;
    return this.gameTeamColorCache.playerColors.get(lowerName) || null;
  }

  getTeamColor(playerName) {
    if (this.gameTeamColorCache.active) {
      return this.getGameCachedTeamColor(playerName);
    }

    return this.getLiveTeamColor(playerName);
  }

  shouldUseDefaultSelfDisplay(playerName, playerInfo) {
    if (!this.gameTeamColorCache.active || playerInfo?.isSelf !== true) {
      return false;
    }

    const cachedTeamColor = this.getGameCachedTeamColor(playerName);
    if (
      !cachedTeamColor ||
      !this.gameTeamColorCache.ownTeamColors.has(cachedTeamColor)
    ) {
      return false;
    }

    const liveTeamColor = this.getCurrentLiveTeamColor(playerName);
    return liveTeamColor !== cachedTeamColor;
  }

  scheduleDisplayRefresh(delayMs = this.DISPLAY_REFRESH_DEBOUNCE_MS) {
    if (this.displayRefreshInProgress) {
      this.displayRefreshQueued = true;
      return;
    }
    if (this.displayRefreshTimer) return;

    const safeDelay = Math.max(0, delayMs);
    this.displayRefreshTimer = setTimeout(() => {
      this.displayRefreshTimer = null;
      this.runScheduledDisplayRefresh();
    }, safeDelay);
  }

  runScheduledDisplayRefresh() {
    if (this.displayRefreshInProgress) {
      this.displayRefreshQueued = true;
      return;
    }

    this.displayRefreshInProgress = true;
    try {
      this.computeAndStoreDisplayState();
      this.applyStoredDisplayState({ force: false });
    } finally {
      this.displayRefreshInProgress = false;
      if (this.displayRefreshQueued) {
        this.displayRefreshQueued = false;
        this.scheduleDisplayRefresh();
      }
    }
  }

  updateAllTabDisplays() {
    this.scheduleDisplayRefresh(0);
  }

  resolveMyTeamColors(grayTeamEnabled) {
    if (!grayTeamEnabled) return null;

    const selfRowNames = [];
    for (const [name, data] of this.playerData.entries()) {
      if (data?.isSelf === true && this.managedPlayers.has(name)) {
        selfRowNames.push(name);
      }
    }

    const sourceNames =
      selfRowNames.length > 0
        ? selfRowNames
        : (typeof this.resolveSelfNames === "function"
          ? this.resolveSelfNames()
          : []);
    if (this.gameTeamColorCache.active) {
      return new Set(this.gameTeamColorCache.ownTeamColors);
    }

    return new Set(
      sourceNames.map((name) => this.getTeamColor(name)).filter(Boolean),
    );
  }

  computeAndStoreDisplayState() {
    const maxWidths = this.calculateMaxWidths();
    const grayTeamEnabled = this.api.config.get("tab.grayOwnTeam");
    const myTeamColors = this.resolveMyTeamColors(grayTeamEnabled);

    for (const [name, data] of this.managedPlayers.entries()) {
      const playerInfo = this.playerData.get(name);
      if (!playerInfo || !data.uuid) {
        this.displayState.delete(name);
        continue;
      }

      const nextState = this.buildDisplayStateForPlayer({
        playerName: name,
        playerInfo,
        maxWidths,
        grayTeamEnabled,
        myTeamColors,
      });
      this.displayState.set(name, {
        uuid: data.uuid,
        ...nextState,
      });
    }
  }

  buildDisplayStateForPlayer({
    playerName,
    playerInfo,
    maxWidths,
    grayTeamEnabled,
    myTeamColors,
  }) {
    const { stats, tags, realName, nickName } = playerInfo;

    if (this.shouldUseDefaultSelfDisplay(playerName, playerInfo)) {
      return {
        clearDisplay: true,
        prefix: "",
        suffix: "",
      };
    }

    const teamColor = this.getTeamColor(playerName);

    let tagSuffix = "";
    const showTags = this.api.config.get("tab.showTags");
    if (showTags && tags && tags.length > 0) {
      tagSuffix = this.tagProviderManager.formatTagsForDisplay(tags);
    }

    const showNicks = this.api.config.get("tab.showNicks");
    if (showNicks && nickName && realName) {
      tagSuffix += `${tagSuffix ? " " : ""}§c(${realName})`;
    } else if (showNicks && nickName && !realName) {
      tagSuffix += `${tagSuffix ? " " : ""}§c[NICK]`;
    }

    const { prefix, suffix } = this.statsFormatter.formatStats(
      stats,
      maxWidths,
      { teamColor, tag: tagSuffix },
    );

    let finalPrefix = prefix;
    let finalSuffix = suffix;

    if (
      grayTeamEnabled &&
      teamColor &&
      myTeamColors &&
      myTeamColors.size > 0 &&
      myTeamColors.has(teamColor)
    ) {
      const teamColorMatch = prefix.match(/§[0-9a-fk-or]$/);
      const preservedTeamColor = teamColorMatch ? teamColorMatch[0] : "§f";
      finalPrefix = prefix
        .replace(/§[0-9a-fk-or]/g, "§8")
        .replace(/§8+$/, preservedTeamColor);
      finalSuffix = suffix.replace(/§[0-9a-fk-or]/g, "§8");
    }

    return {
      prefix: finalPrefix,
      suffix: finalSuffix,
    };
  }

  applyStoredDisplayState(options = {}) {
    const { force = false } = options;

    for (const [name, managed] of this.managedPlayers.entries()) {
      const display = this.displayState.get(name);
      const uuid = managed?.uuid || display?.uuid;
      if (!display || !uuid) continue;

      const stateKey = display.clearDisplay === true
        ? "__wildtab_clear__"
        : `${display.prefix}\u0000${display.suffix}`;
      if (!force && this.lastAppliedDisplayState.get(uuid) === stateKey) {
        continue;
      }

      if (display.clearDisplay === true) {
        this.api.clearDisplayNameSuffix(uuid);
        this.api.clearDisplayNamePrefix?.(uuid);
      } else {
        this.api.setDisplayNamePrefix?.(uuid, display.prefix);
        this.api.setDisplayNameSuffix(uuid, display.suffix);
      }
      this.lastAppliedDisplayState.set(uuid, stateKey);
    }
  }

  patchPlayerStats(playerName, cacheName, expectedUuid, patch) {
    const playerInfo = this.playerData.get(playerName);
    if (!playerInfo?.stats || playerInfo.stats.isLoading) return false;
    if (expectedUuid && playerInfo.stats.uuid !== expectedUuid) return false;

    const nextStats = {
      ...playerInfo.stats,
      ...patch,
    };
    this.playerData.set(playerName, {
      ...playerInfo,
      stats: nextStats,
    });
    if (cacheName) {
      this.hypixelApi.cache?.setPlayerStats(cacheName, nextStats);
    }
    this.scheduleDisplayRefresh();
    return true;
  }

  scheduleDeferredStatsUpdates(playerName, cacheName, stats) {
    if (!stats || stats.isNicked || !stats.uuid) return;
    const expectedUuid = stats.uuid;

    if (stats.pingPending === true) {
      void this.hypixelApi.getLatestPingByUuid(expectedUuid)
        .then((latestPing) => {
          this.patchPlayerStats(playerName, cacheName, expectedUuid, {
            ping: Number.isFinite(latestPing) ? latestPing : null,
            pingPending: false,
          });
        })
        .catch((error) => {
          console.error(
            `[Wildtab] Failed to fetch deferred ping for ${playerName}: ${error.message}`,
          );
          this.patchPlayerStats(playerName, cacheName, expectedUuid, {
            ping: null,
            pingPending: false,
          });
        });
    }

    if (stats.winstreakPending === true) {
      void this.hypixelApi.getEstimatedWinstreakByUuid(expectedUuid)
        .then((estimatedWinstreak) => {
          const hasEstimate = Number.isFinite(estimatedWinstreak);
          this.patchPlayerStats(playerName, cacheName, expectedUuid, {
            winstreak: hasEstimate ? estimatedWinstreak : null,
            winstreakEstimated: hasEstimate,
            winstreakPending: false,
          });
        })
        .catch((error) => {
          console.error(
            `[Wildtab] Failed to fetch deferred winstreak for ${playerName}: ${error.message}`,
          );
          this.patchPlayerStats(playerName, cacheName, expectedUuid, {
            winstreak: null,
            winstreakEstimated: false,
            winstreakPending: false,
          });
        });
    }
  }

  async addPlayerStatsToTab(playerName, options = {}) {
    const {
      realName,
      nickName,
      tags,
      isSelf,
      forceRefresh = false,
      retryAttempt = 0,
    } = options;

    try {
      const existing = this.playerData.get(playerName);
      const resolvedRealName =
        realName !== undefined ? realName : existing?.realName;
      const resolvedNickName =
        nickName !== undefined ? nickName : existing?.nickName;
      const resolvedTags = tags !== undefined ? tags : (existing?.tags || []);
      const resolvedIsSelf =
        isSelf !== undefined ? isSelf === true : existing?.isSelf === true;
      const player = this.api.getPlayerByName(playerName);
      const resolvedUuid =
        player?.uuid || this.resolveTablistUuidByName?.(playerName) || null;

      if (!resolvedUuid) {
        this.scheduleStatsRetry(
          playerName,
          {
            realName: resolvedRealName,
            nickName: resolvedNickName,
            tags,
            isSelf: resolvedIsSelf,
          },
          retryAttempt + 1,
        );
        return;
      }
      if (this.managedPlayers.has(playerName) && !forceRefresh) return;

      const managed = this.managedPlayers.get(playerName);
      if (!managed) {
        this.managedPlayers.set(playerName, {
          type: "auto-stats",
          uuid: resolvedUuid,
        });
      } else if (managed.uuid !== resolvedUuid) {
        this.managedPlayers.set(playerName, {
          ...managed,
          uuid: resolvedUuid,
        });
      }

      const beforeFetch = this.playerData.get(playerName);
      if (!beforeFetch?.stats || beforeFetch.stats.isLoading) {
        this.playerData.set(playerName, {
          stats: { isLoading: true },
          tags: tags !== undefined ? tags : (beforeFetch?.tags || resolvedTags),
          realName:
            realName !== undefined
              ? realName
              : (beforeFetch?.realName ?? resolvedRealName),
          nickName:
            nickName !== undefined
              ? nickName
              : (beforeFetch?.nickName ?? resolvedNickName),
          isSelf:
            isSelf !== undefined ? isSelf === true : (beforeFetch?.isSelf ?? resolvedIsSelf),
        });
        this.scheduleDisplayRefresh();
        this.startRefreshInterval();
      }

      const lookupName = resolvedRealName || playerName;

      const stats = await this.hypixelApi.getPlayerCoreStats(lookupName);

      if (stats === null) {
        const latest = this.playerData.get(playerName);
        const fallbackStats = latest?.stats || existing?.stats || null;
        const loadingStats =
          fallbackStats && !fallbackStats.isLoading
            ? fallbackStats
            : { isLoading: true };
        this.playerData.set(playerName, {
          stats: loadingStats,
          tags: tags !== undefined ? tags : (latest?.tags || resolvedTags),
          realName:
            realName !== undefined
              ? realName
              : (latest?.realName ?? resolvedRealName),
          nickName:
            nickName !== undefined
              ? nickName
              : (latest?.nickName ?? resolvedNickName),
          isSelf: latest?.isSelf ?? resolvedIsSelf,
        });
        this.scheduleStatsRetry(
          playerName,
          {
            realName: resolvedRealName,
            nickName: resolvedNickName,
            tags,
            isSelf: resolvedIsSelf,
          },
          retryAttempt + 1,
        );

        this.scheduleDisplayRefresh();
        this.startRefreshInterval();
        return;
      }

      this.clearStatsRetry(playerName);
      const latest = this.playerData.get(playerName);
      this.playerData.set(playerName, {
        stats,
        tags: tags !== undefined ? tags : (latest?.tags || resolvedTags),
        realName:
          realName !== undefined ? realName : (latest?.realName ?? resolvedRealName),
        nickName:
          nickName !== undefined ? nickName : (latest?.nickName ?? resolvedNickName),
        isSelf: latest?.isSelf ?? resolvedIsSelf,
      });

      this.scheduleDisplayRefresh();
      this.startRefreshInterval();
      this.scheduleDeferredStatsUpdates(playerName, lookupName, stats);
    } catch (error) {
      console.error(
        `[Wildtab] Failed to add stats to tab for ${playerName}: ${error.stack}`,
      );
      this.scheduleStatsRetry(
        playerName,
        {
          realName,
          nickName,
          tags,
          isSelf,
        },
        retryAttempt + 1,
      );
    }
  }

  updatePlayerTags(playerName, tags) {
    if (!this.managedPlayers.has(playerName)) return;
    const playerInfo = this.playerData.get(playerName);
    if (!playerInfo) return;
    playerInfo.tags = tags;
    this.playerData.set(playerName, playerInfo);
    this.scheduleDisplayRefresh();
  }

  updatePlayerNick(playerName, nickName, realName) {
    const playerInfo = this.playerData.get(playerName);
    if (playerInfo) {
      playerInfo.nickName = nickName;
      playerInfo.realName = realName;
      this.playerData.set(playerName, playerInfo);
      this.scheduleDisplayRefresh();
    }
  }
}

module.exports = TabManager;

