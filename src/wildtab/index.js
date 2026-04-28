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

    this.TAG_FOOTER_ABSENCE_MS = 5000;
    this.TAG_FOOTER_PRUNE_INTERVAL_MS = 1000;
    this.TAG_FOOTER_TEAM_LETTERS = {
      "§c": "R",
      "§9": "B",
      "§a": "G",
      "§e": "Y",
      "§b": "A",
      "§f": "W",
      "§d": "P",
      "§8": "S",
    };
    this.tagFooter = {
      baseHeaderRaw: "",
      baseFooterRaw: "",
      eligibleCycleNames: [],
      selectedCycleIndex: 0,
      lastSeenAtByName: new Map(),
      lastSneakState: false,
      panelActive: false,
      whoPlayerOrder: [],
      registeredFooterInterceptors: [],
      registeredSneakInterceptors: [],
      warnedPacketAliases: new Set(),
    };
    this.tagFooterPruneTimer = null;
  }

  get denicker() {
    return this.api.getPluginInstance("denicker");
  }

  registerHandlers() {
    this.api.on("chat", (event) => this.onChat(event));
    this.api.on("respawn", () => this.onRespawn());
    this.api.on("scoreboard_team", () => this.onScoreboardTeamUpdate());
    this.api.on("player_info", (event) => this.onPlayerInfo(event));
    this.api.on("client_entity_action", (event) => this.onClientEntityAction(event));

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

      this.registerTagFooterPacketInterceptors();
    }

    this.startTagFooterPruneLoop();

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

    this.resetTagFooterState({
      keepBaseFooter: true,
      clearWhoOrder: true,
      clearSeenMap: true,
    });
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
      this.touchTagFooterLastSeen(playerName);
    }

    this.pruneAndReaddTagFooterEligiblePlayers();
    this.applyTagFooterToActivePacket();
  }

  onClientEntityAction(event) {
    const actionId = Number(event?.actionId);
    if (!Number.isFinite(actionId)) return;
    if (actionId === 0 && this.tagFooter.lastSneakState === false) {
      this.cycleTagFooterSelectionNext();
      this.tagFooter.lastSneakState = true;
      return;
    }
    if (actionId === 1) {
      this.tagFooter.lastSneakState = false;
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

  isTagFooterEnabled() {
    return this.api.config.get("tab.tagFooter.enabled") === true;
  }

  startTagFooterPruneLoop() {
    if (this.tagFooterPruneTimer) return;
    this.tagFooterPruneTimer = setInterval(() => {
      this.pruneAndReaddTagFooterEligiblePlayers();
      this.applyTagFooterToActivePacket();
    }, this.TAG_FOOTER_PRUNE_INTERVAL_MS);
  }

  touchTagFooterLastSeen(playerName, timestamp = Date.now()) {
    const key = String(playerName || "").trim().toLowerCase();
    if (!key) return;
    this.tagFooter.lastSeenAtByName.set(key, timestamp);
  }

  resetTagFooterState(options = {}) {
    const {
      keepBaseFooter = false,
      clearWhoOrder = false,
      clearSeenMap = false,
    } = options;

    this.tagFooter.eligibleCycleNames = [];
    this.tagFooter.selectedCycleIndex = 0;
    this.tagFooter.panelActive = false;
    this.tagFooter.lastSneakState = false;
    if (!keepBaseFooter) {
      this.tagFooter.baseHeaderRaw = "";
      this.tagFooter.baseFooterRaw = "";
    }
    if (clearWhoOrder) {
      this.tagFooter.whoPlayerOrder = [];
    }
    if (clearSeenMap) {
      this.tagFooter.lastSeenAtByName.clear();
    }
  }

  onWhoRefreshStart() {
    this.resetTagFooterState({
      keepBaseFooter: true,
      clearWhoOrder: true,
      clearSeenMap: true,
    });
  }

  onWhoRefreshComplete(players) {
    this.tagFooter.whoPlayerOrder = [...new Set(
      (Array.isArray(players) ? players : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean),
    )];
    this.refreshTagFooterCycleFromCurrentData({ resetSelection: true });
    this.applyTagFooterToActivePacket();
  }

  onLobbyJoinForTagFooter() {
    this.resetTagFooterState({
      keepBaseFooter: true,
      clearWhoOrder: true,
      clearSeenMap: true,
    });
    this.applyTagFooterToActivePacket();
  }

  getPlayerInfoByNameInsensitive(playerName) {
    const normalized = String(playerName || "").trim().toLowerCase();
    if (!normalized) return null;
    for (const [name, info] of this.tabManager.playerData.entries()) {
      if (String(name || "").toLowerCase() === normalized) {
        return info;
      }
    }
    return null;
  }

  isPlayerPresentInTab(playerName) {
    const normalized = String(playerName || "").trim();
    if (!normalized) return false;

    if (typeof this.api.getPlayerByName === "function") {
      return Boolean(this.api.getPlayerByName(normalized));
    }

    const uuid = this.resolveTablistUuidByName(normalized);
    return Boolean(uuid);
  }

  ensureTagFooterSelectionValid() {
    const size = this.tagFooter.eligibleCycleNames.length;
    if (size <= 0) {
      this.tagFooter.selectedCycleIndex = 0;
      return;
    }
    const nextIndex = this.tagFooter.selectedCycleIndex % size;
    this.tagFooter.selectedCycleIndex = nextIndex < 0 ? nextIndex + size : nextIndex;
  }

  refreshTagFooterCycleFromCurrentData(options = {}) {
    if (!this.isTagFooterEnabled()) {
      this.tagFooter.panelActive = false;
      return;
    }

    const { resetSelection = false } = options;
    const now = Date.now();
    const existingNames = this.tagFooter.eligibleCycleNames;

    const ordered = [];
    const seen = new Set();
    const pushIfEligible = (candidateName) => {
      const trimmed = String(candidateName || "").trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return;
      const info = this.getPlayerInfoByNameInsensitive(trimmed);
      if (!info || !Array.isArray(info.tags) || info.tags.length === 0) return;
      if (!this.isPlayerPresentInTab(trimmed)) return;
      seen.add(key);
      ordered.push(trimmed);
      this.touchTagFooterLastSeen(trimmed, now);
    };

    for (const name of this.tagFooter.whoPlayerOrder) {
      pushIfEligible(name);
    }
    for (const [name, info] of this.tabManager.playerData.entries()) {
      if (!info || !Array.isArray(info.tags) || info.tags.length === 0) continue;
      pushIfEligible(name);
    }

    const previousSelectedName = existingNames[this.tagFooter.selectedCycleIndex] || null;
    this.tagFooter.eligibleCycleNames = ordered;

    if (ordered.length === 0) {
      this.tagFooter.selectedCycleIndex = 0;
      this.tagFooter.panelActive = false;
      return;
    }

    if (resetSelection) {
      this.tagFooter.selectedCycleIndex = 0;
    } else if (previousSelectedName) {
      const nextIndex = ordered.findIndex(
        (name) => name.toLowerCase() === previousSelectedName.toLowerCase(),
      );
      if (nextIndex >= 0) {
        this.tagFooter.selectedCycleIndex = nextIndex;
      } else {
        this.ensureTagFooterSelectionValid();
      }
    } else {
      this.ensureTagFooterSelectionValid();
    }
  }

  pruneAndReaddTagFooterEligiblePlayers() {
    if (!this.isTagFooterEnabled()) return;

    const now = Date.now();
    let changed = false;
    const nextEligible = [];

    for (const name of this.tagFooter.eligibleCycleNames) {
      const normalized = String(name || "").trim();
      if (!normalized) {
        changed = true;
        continue;
      }

      const key = normalized.toLowerCase();
      if (this.isPlayerPresentInTab(normalized)) {
        this.touchTagFooterLastSeen(normalized, now);
        nextEligible.push(normalized);
        continue;
      }

      const lastSeen = this.tagFooter.lastSeenAtByName.get(key) || 0;
      if (now - lastSeen > this.TAG_FOOTER_ABSENCE_MS) {
        changed = true;
        continue;
      }
      nextEligible.push(normalized);
    }

    const eligibleSet = new Set(nextEligible.map((name) => name.toLowerCase()));
    for (const candidate of this.tagFooter.whoPlayerOrder) {
      const name = String(candidate || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (eligibleSet.has(key)) continue;
      const info = this.getPlayerInfoByNameInsensitive(name);
      if (!info || !Array.isArray(info.tags) || info.tags.length === 0) continue;
      if (!this.isPlayerPresentInTab(name)) continue;
      nextEligible.push(name);
      eligibleSet.add(key);
      this.touchTagFooterLastSeen(name, now);
      changed = true;
    }

    if (changed || nextEligible.length !== this.tagFooter.eligibleCycleNames.length) {
      const selectedName = this.tagFooter.eligibleCycleNames[this.tagFooter.selectedCycleIndex] || null;
      this.tagFooter.eligibleCycleNames = nextEligible;
      if (nextEligible.length === 0) {
        this.tagFooter.selectedCycleIndex = 0;
        this.tagFooter.panelActive = false;
      } else if (selectedName) {
        const idx = nextEligible.findIndex(
          (name) => name.toLowerCase() === selectedName.toLowerCase(),
        );
        this.tagFooter.selectedCycleIndex = idx >= 0 ? idx : 0;
      } else {
        this.tagFooter.selectedCycleIndex = 0;
      }
    }
  }

  cycleTagFooterSelectionNext() {
    if (!this.isTagFooterEnabled()) return;
    if (this.tagFooter.eligibleCycleNames.length <= 0) return;
    this.tagFooter.selectedCycleIndex =
      (this.tagFooter.selectedCycleIndex + 1) % this.tagFooter.eligibleCycleNames.length;
    this.applyTagFooterToActivePacket();
  }

  getTagFooterTeamDisplay(playerName) {
    const teamColor = this.tabManager.getTeamColor(playerName) || "§e";
    const teamLetter = this.TAG_FOOTER_TEAM_LETTERS[teamColor] || "?";
    return { teamColor, teamLetter };
  }

  buildTagFooterPanelText() {
    if (!this.isTagFooterEnabled()) {
      this.tagFooter.panelActive = false;
      return "";
    }
    if (this.tagFooter.eligibleCycleNames.length <= 0) {
      this.tagFooter.panelActive = false;
      return "";
    }

    this.ensureTagFooterSelectionValid();
    const selectedPlayer = this.tagFooter.eligibleCycleNames[this.tagFooter.selectedCycleIndex];
    const selectedInfo = this.getPlayerInfoByNameInsensitive(selectedPlayer);
    const selectedTags = Array.isArray(selectedInfo?.tags) ? selectedInfo.tags : [];
    if (selectedTags.length === 0) {
      this.tagFooter.panelActive = false;
      return "";
    }

    const { teamColor, teamLetter } = this.getTagFooterTeamDisplay(selectedPlayer);
    const panel = messages.tagFooter.panel(selectedPlayer, selectedTags, {
      teamColor,
      teamLetter,
    });
    this.tagFooter.panelActive = panel.length > 0;
    return panel;
  }

  tryParseJsonComponent(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return null;
    }
  }

  cloneFooterValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (error) {
        return value;
      }
    }
    return String(value);
  }

  mergeFooterValue(baseFooterRaw, panelText) {
    const base = this.cloneFooterValue(baseFooterRaw);
    if (!panelText) return base;

    if (typeof base === "string") {
      const parsed = this.tryParseJsonComponent(base);
      if (parsed !== null) {
        return {
          text: "",
          extra: [
            parsed,
            { text: panelText },
          ],
        };
      }
      return `${base}${panelText}`;
    }

    if (base && typeof base === "object") {
      return {
        text: "",
        extra: [
          base,
          { text: panelText },
        ],
      };
    }

    return `${String(base || "")}${panelText}`;
  }

  findFooterCarrier(event) {
    const containers = [
      event?.data,
      event?.packet,
      event?.data?.packet,
      event,
    ];
    const footerKeys = [
      "footer",
      "playerListFooter",
      "player_list_footer",
      "tabFooter",
      "tab_footer",
    ];

    for (const container of containers) {
      if (!container || typeof container !== "object") continue;
      for (const key of footerKeys) {
        if (Object.prototype.hasOwnProperty.call(container, key)) {
          return {
            container,
            key,
            value: container[key],
          };
        }
      }
    }
    return null;
  }

  findHeaderValue(event) {
    const containers = [
      event?.data,
      event?.packet,
      event?.data?.packet,
      event,
    ];
    const headerKeys = [
      "header",
      "playerListHeader",
      "player_list_header",
      "tabHeader",
      "tab_header",
    ];
    for (const container of containers) {
      if (!container || typeof container !== "object") continue;
      for (const key of headerKeys) {
        if (Object.prototype.hasOwnProperty.call(container, key)) {
          return container[key];
        }
      }
    }
    return this.tagFooter.baseHeaderRaw;
  }

  applyTagFooterToPacketEvent(event) {
    const carrier = this.findFooterCarrier(event);
    if (!carrier) return false;

    this.tagFooter.baseHeaderRaw = this.cloneFooterValue(this.findHeaderValue(event));
    this.tagFooter.baseFooterRaw = this.cloneFooterValue(carrier.value);
    if (!this.isTagFooterEnabled()) {
      this.tagFooter.panelActive = false;
      return true;
    }
    this.pruneAndReaddTagFooterEligiblePlayers();
    const panelText = this.buildTagFooterPanelText();
    const mergedFooter = this.mergeFooterValue(this.tagFooter.baseFooterRaw, panelText);
    carrier.container[carrier.key] = mergedFooter;
    return true;
  }

  applyTagFooterToActivePacket() {
    this.pruneAndReaddTagFooterEligiblePlayers();
    const panelText = this.buildTagFooterPanelText();
    const sendTabHeaderFooter = this.api.sendTabHeaderFooter;
    if (typeof sendTabHeaderFooter !== "function") return;

    const mergedFooter = this.mergeFooterValue(this.tagFooter.baseFooterRaw, panelText);
    try {
      sendTabHeaderFooter(this.tagFooter.baseHeaderRaw || "", mergedFooter);
    } catch (error) {
      this.api.debugLog?.(
        `[Wildtab] sendTabHeaderFooter failed: ${error.message}`,
      );
    }
  }

  extractSneakActionState(event) {
    const candidates = [
      event?.data,
      event?.packet,
      event?.data?.packet,
      event,
    ];
    const actionKeys = [
      "action",
      "actionId",
      "status",
      "command",
      "mode",
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      for (const key of actionKeys) {
        if (!Object.prototype.hasOwnProperty.call(candidate, key)) continue;
        const value = candidate[key];
        if (typeof value === "number") {
          if (value === 0) return true;
          if (value === 1) return false;
        }
        const normalized = String(value || "").toUpperCase();
        if (!normalized) continue;
        if (
          normalized.includes("START_SNEAKING") ||
          normalized.includes("PRESS_SHIFT_KEY") ||
          normalized.includes("START_CROUCHING")
        ) {
          return true;
        }
        if (
          normalized.includes("STOP_SNEAKING") ||
          normalized.includes("RELEASE_SHIFT_KEY") ||
          normalized.includes("STOP_CROUCHING")
        ) {
          return false;
        }
      }
    }

    return null;
  }

  onClientSneakPacket(event) {
    const sneaking = this.extractSneakActionState(event);
    if (sneaking === null) return;

    if (sneaking === true && this.tagFooter.lastSneakState === false) {
      this.cycleTagFooterSelectionNext();
    }
    this.tagFooter.lastSneakState = sneaking;
  }

  registerPacketAliasInterceptors(aliases, handler, label) {
    const registered = [];
    for (const alias of aliases) {
      try {
        this.api.intercept(alias, (event) => handler(event));
        registered.push(alias);
      } catch (error) {
        const warnKey = `${label}:${alias}`;
        if (this.tagFooter.warnedPacketAliases.has(warnKey)) continue;
        this.tagFooter.warnedPacketAliases.add(warnKey);
        this.api.debugLog?.(
          `[Wildtab] Failed to register ${label} interceptor for ${alias}: ${error.message}`,
        );
      }
    }
    return registered;
  }

  registerTagFooterPacketInterceptors() {
    const footerAliases = [
      "packet:server:playerlist_header",
    ];

    this.tagFooter.registeredFooterInterceptors = this.registerPacketAliasInterceptors(
      footerAliases,
      (event) => this.applyTagFooterToPacketEvent(event),
      "footer",
    );
    if (this.tagFooter.registeredFooterInterceptors.length === 0) {
      this.api.debugLog?.(
        "[Wildtab] No footer packet interceptor could be registered (expected packet:server:playerlist_header).",
      );
    }
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
      // Best-effort cancellation.
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
          this.refreshTagFooterCycleFromCurrentData();
          this.applyTagFooterToActivePacket();

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
