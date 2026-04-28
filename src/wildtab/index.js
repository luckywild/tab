const CacheManager = require("./cache/cache-manager");
const BordicApi = require("./api/bordic");
const MojangApi = require("./api/mojang");
const HypixelApi = require("./api/hypixel");
const UrchinApi = require("./api/tag/providers/urchin");
const SeraphApi = require("./api/tag/providers/seraph");
const TagProviderManager = require("./api/tag/provider-manager");
const StatsFormatter = require("./services/stats-formatter");
const TabManager = require("./services/tab-manager");
const ChatHandler = require("./handlers/chat");
const GameHandler = require("./handlers/game");
const CommandHandler = require("./handlers/command");
const messages = require("./messages");
const {
  parseStringList,
  parseLowercaseSet,
} = require("./utils/config");

class Wildtab {
  constructor(api) {
    this.api = api;
    this.cache = new CacheManager(api);
    this.bordicApi = new BordicApi(api, this.cache);
    this.mojangApi = new MojangApi(api, this.cache);
    this.hypixelApi = new HypixelApi(
      api,
      this.cache,
      this.mojangApi,
      this.bordicApi,
    );
    this.urchinApi = new UrchinApi(api, this.cache);
    this.seraphApi = new SeraphApi(api, this.cache, this.mojangApi);
    this.tagProviderManager = new TagProviderManager(api, this.cache);
    this.tagProviderManager.registerProvider(this.urchinApi);
    this.tagProviderManager.registerProvider(this.seraphApi);
    this.statsFormatter = new StatsFormatter(api);
    this.tabManager = new TabManager(
      api,
      this.hypixelApi,
      this.tagProviderManager,
      this.statsFormatter,
      (playerName) => this.resolveTablistUuidByName(playerName),
      () => this.getSelfNames(),
    );
    this.chatHandler = new ChatHandler(api, this);
    this.gameHandler = new GameHandler(api, this);
    this.commandHandler = new CommandHandler(api, this);
    this.tablistNameToUuid = new Map();

    this.autoStatsMode = false;
    this.checkedPlayersInAutoMode = new Set();
    this.lastCleanMessage = null;
    this.PARTY_IGNORE_TTL_MS = 5000;
    this.PARTY_IGNORE_RETRY_MS = 1000;
    this.PARTY_IGNORE_REFRESH_INTERVAL_MS = 2000;
    this.partyIgnoreCache = {
      expiresAt: 0,
      names: new Set(),
      lastAttemptAt: 0,
      lastUpdatedAt: 0,
      lastResult: "unknown",
      reliable: false,
      allowTagAlerts: false,
    };
    this.partyIgnoreRefreshTimer = null;
    this.partyIgnoreRefreshInFlight = null;

  }

  get denicker() {
    return this.api.getPluginInstance("denicker");
  }

  registerHandlers() {
    this.api.on("chat", (event) => this.onChat(event));
    this.api.on("respawn", () => this.onRespawn());
    this.api.on("scoreboard_team", () => this.onScoreboardTeamUpdate());
    this.api.on("player_info", (event) => this.onPlayerInfo(event));

    if (typeof this.api.intercept === "function") {
      this.api.intercept("packet:client:chat", (event) =>
        this.onOutgoingChat(event),
      );
      this.api.intercept("packet:client:chat_message", (event) =>
        this.onOutgoingChat(event),
      );
      this.api.intercept("packet:client:chat_command", (event) =>
        this.onOutgoingChat(event),
      );
      this.api.intercept("packet:server:chat", (event) =>
        this.onIncomingChatPacket(event),
      );
      this.api.intercept("packet:server:chat_message", (event) =>
        this.onIncomingChatPacket(event),
      );
      this.api.intercept("packet:server:system_chat", (event) =>
        this.onIncomingChatPacket(event),
      );
      this.api.intercept("packet:server:player_chat", (event) =>
        this.onIncomingChatPacket(event),
      );
    }

    this.api.on("denicker:nick_resolved", ({ nickName, realName }) => {
      this.handleNickResolved(nickName, realName);
    });
  }

  async onChat(event) {
    try {
      const cleanMessage = event.message.replace(/§[0-9a-fk-or]/g, "");

      await this.gameHandler.handleGameStart(
        cleanMessage,
        this.lastCleanMessage,
      );
      this.syncPartyIgnoreRefreshLoop();
      this.lastCleanMessage = cleanMessage;

      await this.chatHandler.handleChat(
        cleanMessage,
      );
    } catch (error) {
      console.error(`[Wildtab CRITICAL ON_CHAT]: ${error.stack}`);
    }
  }

  onRespawn() {
    this.tabManager.clearManagedPlayers("all");
    this.tabManager.clearCachedTeamColor();
    this.gameHandler.resetGameState();
    this.chatHandler.clearPendingRequeue();
    this.chatHandler.clearPendingRushAssessment();
    this.tablistNameToUuid.clear();
    this.lastCleanMessage = null;

    if (this.autoStatsMode) {
      this.autoStatsMode = false;
      this.checkedPlayersInAutoMode.clear();
    }
    this.stopPartyIgnoreRefreshLoop();
  }

  onScoreboardTeamUpdate() {
    this.tabManager.clearCachedTeamColor();
    this.tabManager.scheduleDisplayRefresh();
  }

  onPlayerInfo(event) {
    if (!event || !Array.isArray(event.players)) return;

    for (const player of event.players) {
      const playerName = String(player?.name || "").trim();
      const playerUuid = String(player?.uuid || "").trim();
      if (!playerName || !playerUuid) continue;
      this.tablistNameToUuid.set(playerName.toLowerCase(), playerUuid);
    }
  }

  resolveTablistUuidByName(playerName) {
    const key = String(playerName || "").trim().toLowerCase();
    if (!key) return null;
    return this.tablistNameToUuid.get(key) || null;
  }

  getCurrentPlayerName() {
    const currentPlayer = this.api.getCurrentPlayer?.();
    if (!currentPlayer) return "";
    if (typeof currentPlayer === "string") return currentPlayer.trim();
    if (typeof currentPlayer.name === "string") return currentPlayer.name.trim();
    if (typeof currentPlayer.username === "string") {
      return currentPlayer.username.trim();
    }
    return "";
  }

  getSelfNames() {
    const names = [];
    const seen = new Set();

    const addName = (value) => {
      const normalized = String(value || "").trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(normalized);
    };

    addName(this.getCurrentPlayerName());
    for (const nick of parseStringList(this.api.config.get("nicks.me"))) {
      addName(nick);
    }

    return names;
  }

  getSelfNameSetLower() {
    return new Set(this.getSelfNames().map((name) => name.toLowerCase()));
  }

  isPregameActive() {
    return (
      this.gameHandler.hasJoinedGame === true &&
      this.gameHandler.gameStarted !== true
    );
  }

  syncPartyIgnoreRefreshLoop() {
    if (this.isPregameActive()) {
      this.startPartyIgnoreRefreshLoop();
      return;
    }
    this.stopPartyIgnoreRefreshLoop();
  }

  startPartyIgnoreRefreshLoop() {
    if (this.partyIgnoreRefreshTimer) return;
    this.partyIgnoreRefreshTimer = setInterval(() => {
      if (!this.isPregameActive()) {
        this.stopPartyIgnoreRefreshLoop();
        return;
      }
      void this.getPartyMemberNameSetLower({
        forceRefresh: true,
      });
    }, this.PARTY_IGNORE_REFRESH_INTERVAL_MS);
  }

  stopPartyIgnoreRefreshLoop() {
    if (!this.partyIgnoreRefreshTimer) return;
    clearInterval(this.partyIgnoreRefreshTimer);
    this.partyIgnoreRefreshTimer = null;
  }

  updatePartyIgnoreCache(next) {
    this.partyIgnoreCache = {
      ...this.partyIgnoreCache,
      ...next,
      names: new Set(next.names || this.partyIgnoreCache.names || []),
    };
  }

  async refreshPartyIgnoreCache(now) {
    const previousNames = new Set(this.partyIgnoreCache.names);
    const resolved = new Set();
    const selfNames = this.getSelfNameSetLower();

    if (typeof this.api.getPartyInfoAsync !== "function") {
      this.updatePartyIgnoreCache({
        expiresAt: now + this.PARTY_IGNORE_RETRY_MS,
        lastAttemptAt: now,
        lastUpdatedAt: now,
        lastResult: "unsupported",
        reliable: false,
        allowTagAlerts: false,
      });
      return;
    }

    try {
      const partyInfo = await this.api.getPartyInfoAsync(1500);
      const members = Array.isArray(partyInfo?.members) ? partyInfo.members : [];

      if (!partyInfo?.success) {
        this.updatePartyIgnoreCache({
          expiresAt: now + this.PARTY_IGNORE_RETRY_MS,
          lastAttemptAt: now,
          lastUpdatedAt: now,
          lastResult: "failed",
          reliable: false,
          allowTagAlerts: false,
        });
        return;
      }

      if (partyInfo.inParty !== true) {
        this.updatePartyIgnoreCache({
          expiresAt: now + this.PARTY_IGNORE_TTL_MS,
          names: resolved,
          lastAttemptAt: now,
          lastUpdatedAt: now,
          lastResult: "not_in_party",
          reliable: true,
          allowTagAlerts: true,
        });
        return;
      }

      const players = typeof this.api.getPlayers === "function"
        ? this.api.getPlayers() || []
        : [];
      const nameByUuid = new Map();
      for (const player of players) {
        const uuid = String(
          player?.uuid || player?.playerUuid || player?.id || "",
        ).trim().toLowerCase();
        const name = String(player?.name || player?.username || "").trim();
        if (!uuid || !name) continue;
        nameByUuid.set(uuid, name);
      }

      for (const member of members) {
        const explicitName = String(
          member?.name || member?.username || member?.playerName || "",
        ).trim();
        const uuid = String(member?.uuid || member?.playerUuid || "")
          .trim()
          .toLowerCase();
        const resolvedName = explicitName || (uuid ? nameByUuid.get(uuid) || "" : "");
        if (!resolvedName) continue;
        const key = resolvedName.toLowerCase();
        if (!selfNames.has(key)) {
          resolved.add(key);
        }
      }

      const potentiallyIncompleteMembers =
        members.length > 1 &&
        resolved.size === 0 &&
        previousNames.size > 0;
      if (potentiallyIncompleteMembers) {
        this.updatePartyIgnoreCache({
          expiresAt: now + this.PARTY_IGNORE_RETRY_MS,
          names: previousNames,
          lastAttemptAt: now,
          lastUpdatedAt: now,
          lastResult: "incomplete",
          reliable: false,
          allowTagAlerts: false,
        });
        return;
      }

      this.updatePartyIgnoreCache({
        expiresAt: now + this.PARTY_IGNORE_TTL_MS,
        names: resolved,
        lastAttemptAt: now,
        lastUpdatedAt: now,
        lastResult: "in_party",
        reliable: true,
        allowTagAlerts: true,
      });
    } catch (error) {
      this.api.debugLog?.(`[Wildtab] Party member lookup failed: ${error.message}`);
      this.updatePartyIgnoreCache({
        expiresAt: now + this.PARTY_IGNORE_RETRY_MS,
        names: previousNames,
        lastAttemptAt: now,
        lastUpdatedAt: now,
        lastResult: "error",
        reliable: false,
        allowTagAlerts: false,
      });
    }
  }

  async getPartyMemberNameSetLower(options = {}) {
    const { forceRefresh = false } = options;
    const now = Date.now();
    if (!forceRefresh && now < this.partyIgnoreCache.expiresAt) {
      return new Set(this.partyIgnoreCache.names);
    }
    if (this.partyIgnoreRefreshInFlight) {
      await this.partyIgnoreRefreshInFlight;
      return new Set(this.partyIgnoreCache.names);
    }
    const refreshPromise = this.refreshPartyIgnoreCache(now);
    this.partyIgnoreRefreshInFlight = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      if (this.partyIgnoreRefreshInFlight === refreshPromise) {
        this.partyIgnoreRefreshInFlight = null;
      }
    }
    return new Set(this.partyIgnoreCache.names);
  }

  async getAutoIgnoredContext(options = {}) {
    const ignored = new Set(this.getSelfNameSetLower());
    const manualIgnored = parseLowercaseSet(
      this.api.config.get("nicks.ignore"),
    );
    for (const name of manualIgnored) {
      ignored.add(name);
    }
    const partyNames = await this.getPartyMemberNameSetLower(options);
    for (const name of partyNames) {
      ignored.add(name);
    }
    return {
      ignored,
      allowTagAlerts: this.partyIgnoreCache.allowTagAlerts === true,
      partyReliable: this.partyIgnoreCache.reliable === true,
      partyResult: this.partyIgnoreCache.lastResult,
    };
  }

  async getAutoIgnoredNames(options = {}) {
    const context = await this.getAutoIgnoredContext(options);
    return context.ignored;
  }

  onOutgoingChat(event) {
    try {
      const message =
        event?.data?.message ||
        event?.data?.command ||
        event?.message ||
        event?.command ||
        event?.packet?.message ||
        event?.packet?.command ||
        "";
      const normalized =
        typeof message === "string" && !message.startsWith("/")
          ? `/${message}`
          : message;
      this.chatHandler.onOutgoingChatCommand(normalized);
    } catch (error) {
      this.api.debugLog?.(
        `[Wildtab] onOutgoingChat interception failed: ${error.message}`,
      );
    }
  }

  consumeInterceptEvent(event) {
    if (!event || typeof event !== "object") return false;
    try {
      if (typeof event.cancel === "function") {
        event.cancel();
      }
    } catch (error) {
      if (this.api?.config?.get("debug")) {
        this.api.debugLog?.(`[Wildtab] Failed to cancel intercept event: ${error.message}`);
      }
    }
    event.cancelled = true;
    event.canceled = true;
    event.blocked = true;
    return false;
  }

  extractChatTextFromIncomingPacket(event) {
    const candidates = [
      event?.data?.message,
      event?.data?.text,
      event?.message,
      event?.text,
      event?.packet?.message,
      event?.packet?.text,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string") return candidate;
      if (candidate && typeof candidate === "object") {
        if (typeof candidate.text === "string") return candidate.text;
      }
    }
    return "";
  }

  async onIncomingChatPacket(event) {
    try {
      const rawMessage = this.extractChatTextFromIncomingPacket(event);
      if (!rawMessage) return;
      const cleanMessage = rawMessage.replace(/§[0-9a-fk-or]/g, "");
      const shouldConsume = await this.chatHandler.handleIncomingServerChat(
        rawMessage,
        cleanMessage,
      );
      if (shouldConsume === true) {
        return this.consumeInterceptEvent(event);
      }
    } catch (error) {
      this.api.debugLog?.(
        `[Wildtab] onIncomingChatPacket interception failed: ${error.message}`,
      );
    }
  }

  async processWhoPlayers(players) {
    const denicker = this.denicker;
    const selfNameSet = this.getSelfNameSetLower();
    const ignoredContextPromise = this.getAutoIgnoredContext().catch((error) => {
      this.api.debugLog?.(
        `[Wildtab] Failed to refresh ignored-player context for tag alerts: ${error.message}`,
      );
      return {
        ignored: new Set(this.getSelfNameSetLower()),
        allowTagAlerts: false,
        partyReliable: false,
        partyResult: "error",
      };
    });
    const gameStartTagsEnabled =
      this.api.config.get("alerts.gameStartTags") !== false;
    const WHO_PROCESS_CONCURRENCY = 5;
    let nextIndex = 0;

    const playerEntries = players.map((playerName) => {
      const realName = denicker?.getRealName(playerName);
      const lookupName = realName || playerName;
      const nickName = realName ? playerName : null;
      const lowerPlayerName = String(playerName).toLowerCase();
      const lowerLookupName = String(lookupName).toLowerCase();
      const isSelf =
        selfNameSet.has(lowerPlayerName) ||
        selfNameSet.has(lowerLookupName);

      return {
        playerName,
        realName,
        lookupName,
        nickName,
        lowerPlayerName,
        lowerLookupName,
        isSelf,
      };
    });

    this.tabManager.cacheGameTeamColors(playerEntries);

    const processOnePlayer = async (entry) => {
      const {
        playerName,
        realName,
        lookupName,
        nickName,
        lowerPlayerName,
        lowerLookupName,
        isSelf,
      } = entry;

      const statsPromise = this.tabManager.addPlayerStatsToTab(playerName, {
        realName,
        nickName,
        isSelf,
      });

      void (async () => {
        try {
          const tags = await this.tagProviderManager.getTagsForPlayer(lookupName);
          this.tabManager.updatePlayerTags(playerName, tags || []);

          const ignoredContext = await ignoredContextPromise;
          const ignoredPlayers = ignoredContext.ignored;
          const canShowAutoTagAlerts = ignoredContext.allowTagAlerts === true;
          if (
            tags?.length > 0 &&
            gameStartTagsEnabled &&
            canShowAutoTagAlerts &&
            !ignoredPlayers.has(lowerPlayerName) &&
            !ignoredPlayers.has(lowerLookupName)
          ) {
            await this.chatHandler.showTagAlertForPlayer(playerName, tags);
          }
        } catch (err) {
          this.api.debugLog(
            `Error checking tags for ${lookupName}: ${err.message}`,
          );
        }
      })();

      await statsPromise;
    };

    const workers = Array.from(
      { length: Math.min(WHO_PROCESS_CONCURRENCY, playerEntries.length) },
      async () => {
        while (nextIndex < playerEntries.length) {
          const playerIndex = nextIndex;
          nextIndex += 1;
          await processOnePlayer(playerEntries[playerIndex]);
        }
      },
    );

    await Promise.all(workers);
  }

  async displayStatsForPlayer(playerName) {
    const denicker = this.denicker;
    const realName = denicker?.getRealName(playerName);
    const lookupName = realName || playerName;

    const stats = await this.hypixelApi.getPlayerStats(lookupName);

    if (!stats) {
      this.api.chat(messages.error.statsFetch(playerName));
      return null;
    }

    const displayName = realName
      ? `${playerName} (§7${realName}§r)`
      : playerName;

    const message = this.statsFormatter.formatStatsMessage(
      displayName,
      stats,
    );
    this.api.chat(message);
    return stats;
  }

  async handleNickResolved(nickName, realName) {
    const playerInfo = this.tabManager.playerData.get(nickName);
    if (playerInfo) {
      const newStats = await this.hypixelApi.getPlayerStats(realName);
      if (newStats) {
        playerInfo.stats = newStats;
        playerInfo.realName = realName;
        this.tabManager.playerData.set(nickName, playerInfo);
        this.tabManager.scheduleDisplayRefresh();
      }
    }
  }
}

module.exports = Wildtab;
