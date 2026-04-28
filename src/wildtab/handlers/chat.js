const {
  parseLowercaseSet,
  escapeRegex,
} = require("../utils/config");
const messages = require("../messages");
const { renderTagAlert } = require("../services/tag-alert-renderer");

class ChatHandler {
  constructor(api, wildtabInstance) {
    this.api = api;
    this.wildtabInstance = wildtabInstance;
    this.lobbyEnteredAt = 0;
    this.REQUEUE_MIN_REMAINING_MS = 2000;
    this.REQUEUE_RETRY_MS = 5000;
    this.HUB_BACKUP_REMAINING_MS = 1000;
    this.lastApiHealthCheckAt = 0;
    this.apiHealthCheckInFlight = false;
    this.API_HEALTH_CHECK_MIN_INTERVAL_MS = 3000;
    this.apiFailureHubTimer = null;
    this.pendingLocrawRequest = false;
    this.lastLocrawState = null;
    this.pendingAutoWhoRequest = false;
    this.pendingRequeueAttempt = null;
    this.pendingFallbackPlayMode = null;
    this.pendingFallbackHub = false;
    this.pendingLocrawTimeout = null;
    this.pendingRushAssessment = null;
    this.pendingRushAssessmentTimer = null;
    this.pendingRushFollowupTimer = null;
    this.RUSH_ASSESSMENT_RETRY_MS = 750;
    this.RUSH_ASSESSMENT_MAX_WAIT_MS = 90000;
    this.RUSH_ASSESSMENT_MESSAGE_DELAY_MS = 350;
    this.TEAM_COLOR_NAMES = {
      "§c": "red",
      "§9": "blue",
      "§a": "green",
      "§e": "yellow",
      "§b": "aqua",
      "§f": "white",
      "§d": "pink",
      "§8": "gray",
    };
    this.SIDE_COLOR_MAP = {
      "§c": "§9",
      "§9": "§c",
      "§a": "§e",
      "§e": "§a",
      "§b": "§f",
      "§f": "§b",
      "§d": "§8",
      "§8": "§d",
    };
    this.CORNER_COLOR_MAP = {
      "§c": "§8",
      "§8": "§c",
      "§9": "§a",
      "§a": "§9",
      "§e": "§b",
      "§b": "§e",
      "§f": "§d",
      "§d": "§f",
    };
    this.FOUR_TEAM_CORNERS = {
      "§c": ["§e", "§9"],
      "§9": ["§c", "§a"],
      "§a": ["§9", "§e"],
      "§e": ["§c", "§a"],
    };
    this.FOUR_TEAM_OPPOSITE = {
      "§c": "§a",
      "§9": "§e",
      "§a": "§c",
      "§e": "§9",
    };
  }

  async getIgnoredPlayers(options = {}) {
    return this.wildtabInstance.getAutoIgnoredNames(options);
  }

  buildIgnoreCandidates(playerName) {
    const senderName = String(playerName || "").trim();
    const realName = this.wildtabInstance.denicker?.getRealName(senderName) || "";
    const lookupName = realName || senderName;
    const candidates = new Set();
    if (senderName) candidates.add(senderName.toLowerCase());
    if (realName) candidates.add(realName.toLowerCase());
    return {
      senderName,
      lookupName,
      candidates,
    };
  }

  shouldIgnoreCandidateSet(ignoreSet, candidates) {
    for (const candidate of candidates) {
      if (ignoreSet.has(candidate)) return true;
    }
    return false;
  }

  getNumericThreshold(value, parser) {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = parser(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  clearPendingRequeue() {
    this.cancelBackupHubTimer();
    this.cancelRequeueRetryTimer();
    this.pendingRequeueAttempt = null;
  }

  resetLobbySessionState() {
    this.clearPendingRequeue();
    this.clearPendingRushAssessment();
    this.pendingLocrawRequest = false;
    if (this.pendingLocrawTimeout) {
      clearTimeout(this.pendingLocrawTimeout);
      this.pendingLocrawTimeout = null;
    }
    this.pendingAutoWhoRequest = false;
    if (!this.pendingFallbackHub) {
      this.pendingFallbackPlayMode = null;
    }
  }

  clearPendingRushAssessment() {
    if (this.pendingRushAssessmentTimer) {
      clearTimeout(this.pendingRushAssessmentTimer);
      this.pendingRushAssessmentTimer = null;
    }
    if (this.pendingRushFollowupTimer) {
      clearTimeout(this.pendingRushFollowupTimer);
      this.pendingRushFollowupTimer = null;
    }
    this.pendingRushAssessment = null;
  }

  isRushAssessmentEnabled() {
    return this.api.config.get("rush.enabled") !== false;
  }

  isRushAssessmentFirstEnabled() {
    const firstValue = this.api.config.get("rush.first");
    if (firstValue !== undefined && firstValue !== null) {
      return firstValue !== false;
    }
    return this.api.config.get("rush.next") !== false;
  }

  getFkdrTier(value) {
    const fkdr = Number(value) || 0;
    if (fkdr < 0.5) return 0;
    if (fkdr < 1) return 1;
    if (fkdr < 2) return 2;
    if (fkdr < 4) return 3;
    if (fkdr < 8) return 4;
    if (fkdr < 15) return 5;
    if (fkdr < 30) return 6;
    return 7;
  }

  getStarTier(value) {
    const stars = Number(value) || 0;
    if (stars < 50) return 0;
    if (stars < 100) return 1;
    if (stars < 250) return 2;
    if (stars < 500) return 3;
    if (stars < 800) return 4;
    if (stars < 1200) return 5;
    if (stars < 2000) return 6;
    return 7;
  }

  getTierLabel(tierIndex) {
    const labels = ["shit", "bad", "mid", "decent", "good", "insane", "god", "demon"];
    const bounded = Math.max(0, Math.min(labels.length - 1, tierIndex));
    return labels[bounded];
  }

  getLaneCategory({ avgFkdr, avgStars, nickedCount = 0, taggedCount = 0 }) {
    const fkdrTier = this.getFkdrTier(avgFkdr);
    const starTier = this.getStarTier(avgStars);
    const flagTierWeight = (nickedCount + taggedCount) * 5;
    return this.getTierLabel(Math.max(fkdrTier, starTier) + flagTierWeight);
  }

  getRushAssessmentTargetCount(layoutType) {
    const isTrioQuad = layoutType === "trio_quad";
    const primaryKey = isTrioQuad ? "rush.targetTrioQuad" : "rush.targetSoloDuo";
    const fallbackDefault = isTrioQuad ? 1 : 3;
    const fallbackMax = isTrioQuad ? 3 : 4;
    const rawPrimary = Number(this.api.config.get(primaryKey));
    if (Number.isFinite(rawPrimary)) {
      return Math.max(0, Math.min(fallbackMax, Math.round(rawPrimary)));
    }

    const rawLegacy = Number(this.api.config.get("rush.target"));
    if (Number.isFinite(rawLegacy)) {
      return Math.max(0, Math.min(fallbackMax, Math.round(rawLegacy)));
    }

    return fallbackDefault;
  }

  getTeamAverages(players) {
    let fkdrSum = 0;
    let starsSum = 0;
    let count = 0;
    let wsSum = 0;
    let wsCount = 0;
    let anyNicked = false;
    let anyTagged = false;
    let nickedCount = 0;
    let taggedCount = 0;

    for (const entry of players) {
      const stats = entry?.stats;
      if (!stats) continue;

      const tagged = Array.isArray(entry?.tags) && entry.tags.length > 0;
      if (stats.isNicked) {
        anyNicked = true;
        nickedCount += 1;
      }
      if (tagged) {
        anyTagged = true;
        taggedCount += 1;
      }

      if (stats.isNicked) continue;

      fkdrSum += Number(stats.fkdr) || 0;
      starsSum += Number(stats.stars) || 0;
      const wsValue = Number(stats.winstreak);
      if (Number.isFinite(wsValue)) {
        wsSum += wsValue;
        wsCount += 1;
      }
      count += 1;
    }

    return {
      avgFkdr: count > 0 ? fkdrSum / count : 0,
      avgStars: count > 0 ? starsSum / count : 0,
      avgWs: wsCount > 0 ? wsSum / wsCount : null,
      anyNicked,
      anyTagged,
      nickedCount,
      taggedCount,
      hasNickedOrTagged: anyNicked || anyTagged,
    };
  }

  getTeamScore(assessment) {
    return (
      assessment.avgFkdr +
      ((Number(assessment.nickedCount) || 0) * 15) +
      ((Number(assessment.taggedCount) || 0) * 10)
    );
  }

  getRushTeamName(colorCode) {
    return this.TEAM_COLOR_NAMES[colorCode] || "unknown";
  }

  getRushCategoryColor(category) {
    const key = String(category || "").toLowerCase();
    const colors = {
      demon: "§4",
      god: "§5",
      insane: "§c",
      good: "§a",
      decent: "§e",
      mid: "§6",
      bad: "§7",
      shit: "§8",
      unknown: "§8",
    };
    return colors[key] || "§7";
  }

  getRushTeamColorCode(colorCode) {
    if (this.TEAM_COLOR_NAMES[colorCode]) return colorCode;
    return messages.STYLE.secondary;
  }

  formatRushLaneLabel(laneType, teamColorCode = null) {
    const normalizedLane = String(laneType || "lane").toLowerCase();
    const laneWord = `${messages.STYLE.secondary}${normalizedLane}`;
    if (!teamColorCode) return laneWord;
    const teamName = this.getRushTeamName(teamColorCode);
    const teamColor = this.getRushTeamColorCode(teamColorCode);
    return `${laneWord} ${teamColor}${teamName}`;
  }

  formatTeamSegment(teamName, assessment, teamColorCode = null) {
    const flags = [];
    if (assessment.anyTagged) flags.push("cheaters");
    if (assessment.anyNicked) flags.push("nicked");
    const flagSuffix =
      flags.length > 0
        ? `${messages.STYLE.secondary}, ${messages.STYLE.muted}${flags.join("+")}`
        : "";
    const fkdrDisplay = this.formatRushFkdrValue(assessment.avgFkdr);
    const starsDisplay = this.formatRushStarsValue(assessment.avgStars);
    const wsDisplay = this.formatRushWinstreakValue(assessment.avgWs);
    const teamColor = this.getRushTeamColorCode(teamColorCode);
    return `${teamColor}${teamName} ${messages.STYLE.secondary}(${messages.STYLE.secondary}avg fkdr ${fkdrDisplay}${messages.STYLE.secondary}, ${wsDisplay}${messages.STYLE.secondary} ws${messages.STYLE.secondary}, ${starsDisplay}${messages.STYLE.secondary}${flagSuffix}${messages.STYLE.secondary})`;
  }

  formatLaneSegment(laneType, players, teamColorCode = null) {
    const laneLabel = this.formatRushLaneLabel(laneType, teamColorCode);
    if (!players || players.length === 0) {
      return `${laneLabel}${messages.STYLE.secondary}: ${messages.STYLE.muted}unknown`;
    }

    const assessment = this.getTeamAverages(players);
    const category = this.getLaneCategory(assessment);
    const categoryColor = this.getRushCategoryColor(category);
    const fkdrDisplay = this.formatRushFkdrValue(assessment.avgFkdr);
    const starsDisplay = this.formatRushStarsValue(assessment.avgStars);
    const wsDisplay = this.formatRushWinstreakValue(assessment.avgWs);
    return `${laneLabel}${messages.STYLE.secondary}: ${categoryColor}${category} ${messages.STYLE.secondary}(${messages.STYLE.secondary}avg fkdr ${fkdrDisplay}${messages.STYLE.secondary}, ${wsDisplay}${messages.STYLE.secondary} ws${messages.STYLE.secondary}, ${starsDisplay}${messages.STYLE.secondary})`;
  }

  formatTeamOnlySegment(players, teamColorCode) {
    const teamColor = this.getRushTeamColorCode(teamColorCode);
    const teamName = this.getRushTeamName(teamColorCode);
    if (!players || players.length === 0) {
      return `${teamColor}${teamName}${messages.STYLE.secondary}: ${messages.STYLE.muted}unknown`;
    }

    const assessment = this.getTeamAverages(players);
    const category = this.getLaneCategory(assessment);
    const categoryColor = this.getRushCategoryColor(category);
    const fkdrDisplay = this.formatRushFkdrValue(assessment.avgFkdr);
    const starsDisplay = this.formatRushStarsValue(assessment.avgStars);
    const wsDisplay = this.formatRushWinstreakValue(assessment.avgWs);
    return `${teamColor}${teamName}${messages.STYLE.secondary}: ${categoryColor}${category} ${messages.STYLE.secondary}(${messages.STYLE.secondary}avg fkdr ${fkdrDisplay}${messages.STYLE.secondary}, ${wsDisplay}${messages.STYLE.secondary} ws${messages.STYLE.secondary}, ${starsDisplay}${messages.STYLE.secondary})`;
  }

  formatRushFkdrValue(value) {
    const statsFormatter = this.wildtabInstance.statsFormatter;
    const numeric = Number(value) || 0;
    const color = statsFormatter.applyColor("fkdr", numeric);
    return `${color}${numeric.toFixed(1)}`;
  }

  formatRushStarsValue(value) {
    const statsFormatter = this.wildtabInstance.statsFormatter;
    const numeric = Number(value) || 0;
    const starToken = statsFormatter.formatPrestigeStars(Math.round(numeric));
    const plainDigits = String(Math.round(numeric));
    const withoutBrackets = String(starToken).replace(/[\[\]✫✪⚝✥]/g, "");
    const cleaned = withoutBrackets.replace(/§r/g, "").trim();
    const symbolMatches = [...String(starToken).matchAll(/((?:§[0-9a-fk-or])*)([✫✪⚝✥])/gi)];
    const lastSymbol = symbolMatches[symbolMatches.length - 1];
    let symbolSuffix = `${messages.STYLE.secondary}✫`;
    if (lastSymbol) {
      const controlCodes = [...String(lastSymbol[1] || "").matchAll(/§[0-9a-fk-or]/gi)];
      const symbolColor =
        controlCodes.length > 0
          ? controlCodes[controlCodes.length - 1][0]
          : messages.STYLE.secondary;
      symbolSuffix = `${symbolColor}${lastSymbol[2]}`;
    }
    const valueText =
      cleaned.length > 0 ? cleaned : `${messages.STYLE.secondary}${plainDigits}`;
    return `${valueText}${symbolSuffix}`;
  }

  formatRushWinstreakValue(value) {
    if (!Number.isFinite(value)) return `${messages.STYLE.muted}?`;
    const statsFormatter = this.wildtabInstance.statsFormatter;
    const numeric = Number(value) || 0;
    const color = statsFormatter.applyColor("winstreak", numeric);
    return `${color}${Math.round(numeric)}`;
  }

  getRushLayoutType(groupedByColor) {
    const mode = String(this.lastLocrawState?.mode || "").toUpperCase();
    if (mode.includes("EIGHT_")) return "solo_duo";
    if (mode.includes("FOUR_")) return "trio_quad";

    const fourTeamColors = new Set(["§c", "§9", "§a", "§e"]);
    const colors = [...groupedByColor.keys()];
    const onlyFourTeamPalette =
      colors.length > 0 && colors.every((color) => fourTeamColors.has(color));
    if (onlyFourTeamPalette && colors.length <= 4) {
      return "trio_quad";
    }
    return "solo_duo";
  }

  buildRushFirstSummaryText(groupedByColor, myTeamColor, layoutType) {
    if (layoutType === "trio_quad") {
      const corners = this.FOUR_TEAM_CORNERS[myTeamColor] || [];
      const segments = [];

      for (const color of corners) {
        segments.push(this.formatTeamOnlySegment(groupedByColor.get(color) || [], color));
      }

      if (segments.length === 0) {
        return `${messages.STYLE.secondary}corners ${messages.STYLE.muted}unknown`;
      }
      return `${messages.STYLE.secondary}corners ${segments.join(`${messages.STYLE.secondary}, `)}`;
    }

    const sideColor = this.SIDE_COLOR_MAP[myTeamColor] || null;
    const cornerColor = this.CORNER_COLOR_MAP[myTeamColor] || null;
    const sidePlayers = sideColor ? groupedByColor.get(sideColor) || [] : [];
    const cornerPlayers = cornerColor ? groupedByColor.get(cornerColor) || [] : [];
    return `${this.formatLaneSegment("side", sidePlayers, sideColor)}, ${this.formatLaneSegment("corner", cornerPlayers, cornerColor)}`;
  }

  buildRushTeamGroups(players) {
    const tabManager = this.wildtabInstance.tabManager;
    const groupedByColor = new Map();
    let myTeamColor = null;

    for (const playerName of players) {
      const playerInfo = tabManager.playerData.get(playerName);
      const stats = playerInfo?.stats;
      if (!playerInfo || !stats || stats.isLoading) {
        return { ready: false, reason: "unresolved_stats" };
      }

      const teamColor = tabManager.getTeamColor(playerName);
      if (!teamColor || !this.TEAM_COLOR_NAMES[teamColor]) continue;

      if (!groupedByColor.has(teamColor)) {
        groupedByColor.set(teamColor, []);
      }
      groupedByColor.get(teamColor).push({
        name: playerName,
        stats,
        tags: playerInfo.tags || [],
        isSelf: playerInfo.isSelf === true,
      });

      if (playerInfo.isSelf === true) {
        myTeamColor = teamColor;
      }
    }

    if (!myTeamColor) {
      const myNicks = this.wildtabInstance.getSelfNames();
      for (const nick of myNicks) {
        const color = tabManager.getTeamColor(nick);
        if (color) {
          myTeamColor = color;
          break;
        }
      }
    }

    if (!myTeamColor) {
      return { ready: false, reason: "my_team_unknown" };
    }

    const enemyColors = [...groupedByColor.keys()].filter(
      (color) => color !== myTeamColor,
    );
    if (enemyColors.length === 0) {
      return { ready: false, reason: "no_enemy_teams" };
    }

    return {
      ready: true,
      myTeamColor,
      groupedByColor,
    };
  }

  startRushAssessment(players) {
    if (!this.isRushAssessmentEnabled()) {
      this.clearPendingRushAssessment();
      return;
    }
    this.clearPendingRushAssessment();
    this.pendingRushAssessment = {
      startedAt: Date.now(),
      players: [...new Set(players)],
    };
    void this.tryEmitRushAssessment();
  }

  async isInPartyForRush() {
    if (typeof this.api.getPartyInfoAsync === "function") {
      try {
        const partyInfo = await this.api.getPartyInfoAsync(1200);
        if (partyInfo && partyInfo.success === true) {
          return partyInfo.inParty === true;
        }
      } catch (error) {
        this.api.debugLog?.(
          `[ChatHandler] getPartyInfoAsync failed in rush path: ${error.message}`,
        );
      }
    }

    if (typeof this.api.isInParty === "function") {
      try {
        return await new Promise((resolve) => {
          let resolved = false;
          const finish = (value) => {
            if (resolved) return;
            resolved = true;
            resolve(value === true);
          };

          this.api.isInParty((result) => {
            if (typeof result === "boolean") {
              finish(result);
              return;
            }
            if (result && typeof result === "object") {
              finish(result.inParty === true);
              return;
            }
            finish(false);
          }, 1200);

          setTimeout(() => finish(false), 1300);
        });
      } catch (error) {
        this.api.debugLog?.(
          `[ChatHandler] isInParty callback check failed in rush path: ${error.message}`,
        );
      }
    }

    return false;
  }

  sendRushLine(text, inParty) {
    const partyChatWhenInParty =
      this.api.config.get("rush.partyChatWhenInParty") !== false;
    if (inParty === true && partyChatWhenInParty) {
      const plainText = String(text ?? "").replace(/§[0-9a-fk-or]/gi, "");
      this.api.sendChatToServer(`/pc [wt] ${plainText}`);
      return;
    }
    this.api.chat(messages.rush.localSummary(text));
  }

  async tryEmitRushAssessment() {
    if (!this.pendingRushAssessment) return;
    if (!this.isRushAssessmentEnabled()) {
      this.clearPendingRushAssessment();
      return;
    }
    if (!this.wildtabInstance.gameHandler.hasJoinedGame) {
      this.clearPendingRushAssessment();
      return;
    }

    const elapsed = Date.now() - this.pendingRushAssessment.startedAt;
    if (elapsed > this.RUSH_ASSESSMENT_MAX_WAIT_MS) {
      this.clearPendingRushAssessment();
      return;
    }

    const grouped = this.buildRushTeamGroups(this.pendingRushAssessment.players);
    if (!grouped.ready) {
      this.pendingRushAssessmentTimer = setTimeout(() => {
        this.pendingRushAssessmentTimer = null;
        void this.tryEmitRushAssessment();
      }, this.RUSH_ASSESSMENT_RETRY_MS);
      return;
    }

    const myTeamColor = grouped.myTeamColor;
    const layoutType = this.getRushLayoutType(grouped.groupedByColor);
    const inParty = await this.isInPartyForRush();

    if (this.isRushAssessmentFirstEnabled()) {
      const summaryText = this.buildRushFirstSummaryText(
        grouped.groupedByColor,
        myTeamColor,
        layoutType,
      );
      this.sendRushLine(summaryText, inParty);
    }

    const rankedTargets = [...grouped.groupedByColor.entries()]
      .filter(([color]) => color !== myTeamColor)
      .map(([color, teamPlayers]) => {
        const assessment = this.getTeamAverages(teamPlayers);
        return {
          color,
          teamName: this.getRushTeamName(color),
          assessment,
          score: this.getTeamScore(assessment),
        };
      })
      .sort((a, b) => b.score - a.score);

    const targetCount = this.getRushAssessmentTargetCount(layoutType);
    let targetMessage = null;
    if (targetCount > 0) {
      const targetSegments = rankedTargets
        .slice(0, targetCount)
        .map((entry) =>
          this.formatTeamSegment(entry.teamName, entry.assessment, entry.color),
        );
      targetMessage = messages.rush.targetSummary(targetSegments);
    }
    this.pendingRushAssessment = null;
    if (targetMessage) {
      this.pendingRushFollowupTimer = setTimeout(() => {
        this.pendingRushFollowupTimer = null;
        if (!this.isRushAssessmentEnabled()) return;
        if (!this.wildtabInstance.gameHandler.hasJoinedGame) return;
        this.sendRushLine(targetMessage, inParty);
      }, this.RUSH_ASSESSMENT_MESSAGE_DELAY_MS);
    }
  }

  isRequeueCommand(command) {
    return (
      typeof command === "string" &&
      /^\/?requeue(?:\s|$)/i.test(command.trim())
    );
  }

  isHubCommand(command) {
    return (
      typeof command === "string" && /^\/?hub(?:\s|$)/i.test(command.trim())
    );
  }

  markLobbyEntered(timestamp = Date.now()) {
    this.lobbyEnteredAt = timestamp;
  }

  resetLobbyEntered() {
    this.lobbyEnteredAt = 0;
  }

  onOutgoingChatCommand(message) {
    if (this.isRequeueCommand(message)) {
      this.pendingAutoWhoRequest = false;
      return;
    }

    if (this.isHubCommand(message)) {
      this.resetLobbyEntered();
      this.pendingAutoWhoRequest = false;
    }
  }

  getAutododgeDecision() {
    const now = Date.now();

    if (!this.isPregame()) {
      return { action: "no_action", reason: "not_pregame" };
    }
    if (this.pendingRequeueAttempt) {
      return { action: "no_action", reason: "requeue_pending" };
    }

    const cfg = this.getAutododgeConfig();
    const requeueEnabled = cfg.requeue === true;

    const estimatedStartTime =
      this.wildtabInstance.gameHandler.getEstimatedGameStartTime();
    if (estimatedStartTime === null) {
      if (requeueEnabled) {
        return { action: "requeue_now", reason: "countdown_unknown_requeue" };
      }
      return { action: "hub_now", reason: "countdown_unknown" };
    }

    const remainingMs = estimatedStartTime - now;
    if (
      requeueEnabled &&
      remainingMs >= this.REQUEUE_MIN_REMAINING_MS &&
      !this.pendingRequeueAttempt
    ) {
      return { action: "requeue_now", reason: "requeue_window", remainingMs };
    }

    return { action: "hub_now", reason: "hub_fallback", remainingMs };
  }

  cancelBackupHubTimer() {
    if (this.pendingRequeueAttempt?.backupHubTimer) {
      clearTimeout(this.pendingRequeueAttempt.backupHubTimer);
      this.pendingRequeueAttempt.backupHubTimer = null;
    }
  }

  cancelRequeueRetryTimer() {
    if (this.pendingRequeueAttempt?.retryTimer) {
      clearTimeout(this.pendingRequeueAttempt.retryTimer);
      this.pendingRequeueAttempt.retryTimer = null;
    }
  }

  armBackupHub(reason, options = {}) {
    const announce = options.announce !== false;
    if (!this.pendingRequeueAttempt) return;
    const deadlineAt = this.pendingRequeueAttempt.deadlineAt;
    if (!Number.isFinite(deadlineAt)) {
      this.cancelBackupHubTimer();
      return;
    }
    const delayMs = Math.max(0, deadlineAt - Date.now());
    this.cancelBackupHubTimer();

    this.pendingRequeueAttempt.backupHubTimer = setTimeout(() => {
      if (!this.pendingRequeueAttempt) return;
      if (!this.isPregame()) {
        this.clearPendingRequeue();
        return;
      }

      this.executePendingRequeueFallbackHub();
    }, delayMs);
    if (announce) {
      this.api.chat(messages.autododge.requeueBackupArmed);
    }
  }

  armRequeueRetry() {
    if (!this.pendingRequeueAttempt) return;
    this.cancelRequeueRetryTimer();
    this.pendingRequeueAttempt.retryTimer = setTimeout(() => {
      if (!this.pendingRequeueAttempt) return;
      if (!this.isPregame()) {
        this.clearPendingRequeue();
        return;
      }

      const deadlineAt = this.pendingRequeueAttempt.deadlineAt;
      if (Number.isFinite(deadlineAt) && Date.now() >= deadlineAt) {
        return;
      }

      const estimatedStartTime = this.wildtabInstance.gameHandler.getEstimatedGameStartTime();
      if (estimatedStartTime) {
        this.pendingRequeueAttempt.estimatedStartAt = estimatedStartTime;
        this.pendingRequeueAttempt.deadlineAt =
          estimatedStartTime - this.HUB_BACKUP_REMAINING_MS;
      }

      this.api.chat(messages.autododge.requeueAttemptRetry);
      this.sendDodgeCommand("/requeue");
      this.armBackupHub(this.pendingRequeueAttempt.reason, { announce: false });
      this.armRequeueRetry();
    }, this.REQUEUE_RETRY_MS);
  }

  executePendingRequeueFallbackHub() {
    if (!this.pendingRequeueAttempt) return false;
    const fallbackMode = this.pendingRequeueAttempt.fallbackPlayMode || null;
    this.api.chat(messages.autododge.requeueFallbackHub);
    this.sendDodgeCommand("/hub");
    this.pendingFallbackPlayMode = fallbackMode || "__UNKNOWN__";
    this.pendingFallbackHub = true;
    this.clearPendingRequeue();
    setTimeout(() => {
      this.requestLocrawIfNeeded();
    }, 300);
    return true;
  }

  confirmRequeueSucceeded() {
    if (!this.pendingRequeueAttempt) return;
    this.cancelBackupHubTimer();
    this.cancelRequeueRetryTimer();
    this.pendingRequeueAttempt = null;
    this.api.chat(messages.autododge.requeueConfirmed);
  }

  requestAutoWho() {
    const hideOutput = this.api.config.get("autoWho.hideOutput") !== false;
    this.pendingAutoWhoRequest = hideOutput;
    this.api.sendChatToServer("/who");
  }

  requestLocrawIfNeeded() {
    this.pendingLocrawRequest = true;
    if (this.pendingLocrawTimeout) {
      clearTimeout(this.pendingLocrawTimeout);
    }
    this.pendingLocrawTimeout = setTimeout(() => {
      this.pendingLocrawTimeout = null;
      this.pendingLocrawRequest = false;
    }, 3000);
    this.api.sendChatToServer("/locraw");
  }

  isLikelyLocrawJson(cleanMessage) {
    const text = String(cleanMessage || "").trim();
    if (!text.startsWith("{") || !text.endsWith("}")) return false;
    return (
      text.includes("\"server\"") ||
      text.includes("\"gametype\"") ||
      text.includes("\"mode\"") ||
      text.includes("\"map\"")
    );
  }

  parseLocrawPayload(cleanMessage) {
    const text = String(cleanMessage || "").trim();
    if (!text.startsWith("{") || !text.endsWith("}")) return null;

    try {
      const payload = JSON.parse(text);
      if (!payload || typeof payload !== "object") return null;
      if (!payload.mode && !payload.map && !payload.server) return null;
      return {
        server: payload.server || null,
        gametype: payload.gametype || null,
        mode: payload.mode || null,
        map: payload.map || null,
        at: Date.now(),
      };
    } catch (error) {
      return null;
    }
  }

  isHubLocrawState(state) {
    if (!state) return false;
    const game = String(state.gametype || "").toUpperCase();
    if (!game) return false;
    return game.includes("LOBBY") || game === "MAIN";
  }

  async handleLocrawState(state) {
    const previous = this.lastLocrawState;
    this.lastLocrawState = state;
    this.pendingLocrawRequest = false;
    if (this.pendingLocrawTimeout) {
      clearTimeout(this.pendingLocrawTimeout);
      this.pendingLocrawTimeout = null;
    }

    if (
      this.pendingRequeueAttempt &&
      previous?.server &&
      state?.server &&
      previous.server !== state.server
    ) {
      this.confirmRequeueSucceeded();
    }

    if (
      this.pendingFallbackPlayMode &&
      this.isHubLocrawState(state) &&
      typeof this.pendingFallbackPlayMode === "string" &&
      this.pendingFallbackPlayMode !== "__UNKNOWN__"
    ) {
      const mode = this.pendingFallbackPlayMode;
      this.pendingFallbackPlayMode = null;
      this.sendDodgeCommand(`/play ${mode}`);
      this.api.chat(messages.autododge.requeueFallbackPlay(mode));
      this.pendingFallbackHub = false;
      return;
    }

    if (this.pendingFallbackPlayMode === "__UNKNOWN__" && this.isHubLocrawState(state)) {
      this.pendingFallbackPlayMode = null;
      this.api.chat(messages.autododge.requeueFallbackPlayUnknown);
      this.pendingFallbackHub = false;
      return;
    }

    if (this.pendingFallbackHub && !this.isHubLocrawState(state)) {
      this.pendingFallbackHub = false;
      this.pendingFallbackPlayMode = null;
    }

    if (!this.isPregame()) return;
    if (!this.shouldCheckDodgeMaps()) return;
    if (!state?.map) return;

    const normalizedMapName = String(state.map).toLowerCase();
    const dodgeMaps = parseLowercaseSet(this.getAutododgeConfig().dodgeMaps?.list);
    if (dodgeMaps.size === 0 || !dodgeMaps.has(normalizedMapName)) {
      return;
    }

    await this.handleMapDodge(state.map);
  }

  shouldHideAutoWhoOutput(cleanMessage) {
    if (!this.pendingAutoWhoRequest) return false;
    if (/^ONLINE: /i.test(cleanMessage)) return true;
    if (/^\/?who$/i.test(cleanMessage.trim())) return true;
    return false;
  }

  async handleHiddenWhoLine(cleanMessage) {
    const whoMatch = cleanMessage.match(/^ONLINE: (.*)$/);
    if (!whoMatch) return false;
    this.pendingAutoWhoRequest = false;
    await this.handleWhoList(whoMatch[1]);
    return true;
  }

  async handleWhoList(rawPlayerList) {
    this.wildtabInstance.onWhoRefreshStart();
    await this.getIgnoredPlayers({ forceRefresh: true });
    if (this.wildtabInstance.autoStatsMode) {
      this.wildtabInstance.autoStatsMode = false;
      this.wildtabInstance.checkedPlayersInAutoMode.clear();
    }
    this.wildtabInstance.tabManager.clearManagedPlayers("all");
    const players = String(rawPlayerList || "")
      .split(", ")
      .map((p) => p.trim())
      .filter(Boolean);
    await this.wildtabInstance.processWhoPlayers(players);
    this.wildtabInstance.onWhoRefreshComplete(players);
    this.startRushAssessment(players);
  }

  async handlePendingLocrawLine(cleanMessage) {
    const locrawState = this.parseLocrawPayload(cleanMessage);
    if (this.pendingLocrawRequest && locrawState) {
      await this.handleLocrawState(locrawState);
      return true;
    }
    if (this.pendingLocrawRequest && this.isLikelyLocrawJson(cleanMessage)) {
      this.pendingLocrawRequest = false;
      if (this.pendingLocrawTimeout) {
        clearTimeout(this.pendingLocrawTimeout);
        this.pendingLocrawTimeout = null;
      }
      return true;
    }
    return false;
  }

  async handleIncomingServerChat(rawMessage, cleanMessage) {
    if (this.pendingLocrawRequest && /^\/?locraw$/i.test(cleanMessage.trim())) {
      return true;
    }

    if (this.shouldHideAutoWhoOutput(cleanMessage)) {
      const handledWho = await this.handleHiddenWhoLine(cleanMessage);
      if (!handledWho && /^\/?who$/i.test(cleanMessage.trim())) {
        return true;
      }
      if (handledWho) return true;
    }

    if (await this.handlePendingLocrawLine(cleanMessage)) {
      return true;
    }

    return false;
  }

  sendDodgeCommand(command) {
    this.api.sendChatToServer(command);
  }

  getAutododgeConfig() {
    return this.api.config.get("autododge") || {};
  }

  isPregame() {
    return (
      this.wildtabInstance.gameHandler.hasJoinedGame &&
      !this.wildtabInstance.gameHandler.gameStarted
    );
  }

  shouldCheckDodgeMaps() {
    const cfg = this.getAutododgeConfig();
    return cfg.enabled === true && cfg.dodgeMaps?.enabled === true;
  }

  async checkApisOnJoin() {
    if (this.api.config.get("api.testOnLobbyJoin") === false) {
      return;
    }

    const now = Date.now();
    if (this.apiHealthCheckInFlight) return;
    if (now - this.lastApiHealthCheckAt < this.API_HEALTH_CHECK_MIN_INTERVAL_MS) {
      return;
    }

    this.lastApiHealthCheckAt = now;
    this.apiHealthCheckInFlight = true;

    try {
      const commandHandler = this.wildtabInstance.commandHandler;
      if (!commandHandler || typeof commandHandler.runApiHealthChecks !== "function") {
        return;
      }

      const results = await commandHandler.runApiHealthChecks();
      const failures = results.filter((result) => !result.success && !result.skipped);
      if (failures.length === 0) return;

      try {
        this.api.sound?.("random.anvil_land");
      } catch (soundError) {
        // Keep chat warning even if sound playback fails.
      }

      this.api.chat(messages.autododge.apiDownPadTop);
      this.api.chat(messages.autododge.apiDownTop);
      this.api.chat(messages.autododge.apiDownHeader);
      for (const failure of failures) {
        this.api.chat(messages.autododge.apiDownLine(failure.name, failure.error));
      }
      this.api.chat(messages.autododge.apiDownBottom);
      this.api.chat(messages.autododge.apiDownPadBottom);

      const shouldHubOnFailure = this.api.config.get("api.hubOnApiFailure") !== false;
      if (shouldHubOnFailure) {
        this.clearPendingRequeue();
        if (this.apiFailureHubTimer) {
          clearTimeout(this.apiFailureHubTimer);
        }
        this.apiFailureHubTimer = setTimeout(() => {
          this.apiFailureHubTimer = null;
          this.sendDodgeCommand("/hub");
        }, 1000);
      }
    } catch (err) {
      this.api.debugLog?.(
        `[ChatHandler] checkApisOnJoin failed: ${err.message}`,
      );
    } finally {
      this.apiHealthCheckInFlight = false;
    }
  }

  processAutododge(reason, options = {}) {
    const decision = this.getAutododgeDecision();

    if (decision.action === "no_action") {
      if (this.pendingRequeueAttempt) {
        const shouldAnnounceGameStartClear = this.wildtabInstance.gameHandler.gameStarted;
        this.clearPendingRequeue();
        if (shouldAnnounceGameStartClear) {
          this.api.chat(messages.autododge.queuedRequeueCleared);
        }
      }
      return { executed: false, queued: false, command: null, decision };
    }

    if (decision.action === "hub_now") {
      this.sendDodgeCommand("/hub");
      if (this.getAutododgeConfig().requeue !== true) {
        this.api.chat(messages.autododge.directHubRequeueDisabled);
      } else if (this.pendingRequeueAttempt) {
        this.api.chat(messages.autododge.queuedRequeueUnsafeHub);
      }
      this.clearPendingRequeue();
      return { executed: true, queued: false, command: "/hub", decision };
    }

    if (decision.action === "requeue_now") {
      const estimatedStartTime = this.wildtabInstance.gameHandler.getEstimatedGameStartTime();

      this.pendingRequeueAttempt = {
        startedAt: Date.now(),
        reason,
        backupHubTimer: null,
        retryTimer: null,
        estimatedStartAt: estimatedStartTime || null,
        deadlineAt: estimatedStartTime
          ? estimatedStartTime - this.HUB_BACKUP_REMAINING_MS
          : null,
        fallbackPlayMode: this.lastLocrawState?.mode || null,
      };
      this.api.chat(messages.autododge.requeueAttempt);
      this.sendDodgeCommand("/requeue");
      this.armBackupHub(reason);
      this.armRequeueRetry();
      return { executed: true, queued: false, command: "/requeue", decision };
    }

    return { executed: false, queued: false, command: null, decision };
  }

  reevaluatePendingRequeue(source, countdownSeconds = null) {
    if (!this.pendingRequeueAttempt) return;
    if (source === "countdown" && Number.isFinite(countdownSeconds)) {
      const remainingMs = countdownSeconds * 1000;
      if (remainingMs <= this.REQUEUE_MIN_REMAINING_MS) {
        this.executePendingRequeueFallbackHub();
        return;
      }

      const estimatedStartTime = Date.now() + remainingMs;
      this.pendingRequeueAttempt.estimatedStartAt = estimatedStartTime;
      this.pendingRequeueAttempt.deadlineAt =
        estimatedStartTime - this.HUB_BACKUP_REMAINING_MS;
    }
    this.armBackupHub(this.pendingRequeueAttempt.reason, { announce: false });
  }

  async handleChat(cleanMessage) {
    if (this.pendingAutoWhoRequest && this.shouldHideAutoWhoOutput(cleanMessage)) {
      await this.handleHiddenWhoLine(cleanMessage);
      return;
    }

    if (await this.handlePendingLocrawLine(cleanMessage)) {
      return;
    }

    if (!this.isPregame()) {
      this.resetLobbyEntered();
      if (this.pendingRequeueAttempt) {
        const gameStarted = this.wildtabInstance.gameHandler.gameStarted;
        this.clearPendingRequeue();
        if (gameStarted) {
          this.api.chat(messages.autododge.queuedRequeueCleared);
        }
      }
    }

    const myNicks = this.wildtabInstance.getSelfNames();
    const myNickSet = new Set(myNicks.map((nick) => nick.toLowerCase()));

    const isSelfJoin = myNicks.some((nick) => {
      const joinRegex = new RegExp(
        `^${escapeRegex(nick)} has joined \\(\\d+\\/\\d+\\)!$`,
        "i",
      );
      return joinRegex.test(cleanMessage);
    });
    if (isSelfJoin) {
      this.resetLobbySessionState();
      this.wildtabInstance.onLobbyJoinForTagFooter();
      this.markLobbyEntered();
      this.wildtabInstance.tabManager.resetGameTeamColorCache();
      this.wildtabInstance.autoStatsMode = true;
      this.wildtabInstance.checkedPlayersInAutoMode.clear();
      this.requestLocrawIfNeeded();
      void this.checkApisOnJoin();
      return;
    }

    const whoMatch = cleanMessage.match(/^ONLINE: (.*)$/);
    if (whoMatch) {
      this.pendingAutoWhoRequest = false;
      await this.handleWhoList(whoMatch[1]);
      return;
    }

    const countdownSeconds =
      this.wildtabInstance.gameHandler.getCountdownSeconds(cleanMessage);
    if (countdownSeconds !== null && this.pendingRequeueAttempt) {
      this.reevaluatePendingRequeue("countdown", countdownSeconds);
    }

    const chatRegex = /^(?:\[.*?\]\s*)*(\w{3,16})(?::| \u00BB) (.*)/;
    const match = cleanMessage.match(chatRegex);
    if (!match) return;

    const senderName = match[1];
    if (myNickSet.has(senderName.toLowerCase())) return;

    const isPregame = this.isPregame();
    const ignoredContext = await this.wildtabInstance.getAutoIgnoredContext();
    const senderCandidates = this.buildIgnoreCandidates(senderName);
    if (
      isPregame &&
      this.shouldIgnoreCandidateSet(ignoredContext.ignored, senderCandidates.candidates)
    ) {
      return;
    }

    if (
      isPregame &&
      !this.wildtabInstance.checkedPlayersInAutoMode.has(
        senderCandidates.lookupName.toLowerCase(),
      )
    ) {
      const showLobbyChatStats =
        this.api.config.get("alerts.lobbyChatStats") !== false;
      const stats = showLobbyChatStats
        ? await this.wildtabInstance.displayStatsForPlayer(senderName)
        : await this.wildtabInstance.hypixelApi.getPlayerStats(
          senderCandidates.lookupName,
        );
      if (stats !== null && stats !== undefined) {
        this.wildtabInstance.checkedPlayersInAutoMode.add(
          senderCandidates.lookupName.toLowerCase(),
        );
      }

      if (stats && this.shouldDodgePlayer(stats)) {
        await this.handleDodge(senderName, stats);
        return;
      }
    }

    await this.checkAndShowTagAlert(senderName, ignoredContext);
  }

  async checkAndShowTagAlert(playerName, ignoredContext = null) {
    const isPregame = this.isPregame();
    if (!isPregame) return;
    const context =
      ignoredContext || await this.wildtabInstance.getAutoIgnoredContext();
    if (context.allowTagAlerts !== true) return;

    const candidates = this.buildIgnoreCandidates(playerName);
    if (this.shouldIgnoreCandidateSet(context.ignored, candidates.candidates)) return;

    const tagProviderManager = this.wildtabInstance.tagProviderManager;
    try {
      const tags = await tagProviderManager.getTagsForPlayer(candidates.lookupName);
      if (tags.length === 0) return;

      const latestContext = await this.wildtabInstance.getAutoIgnoredContext();
      if (latestContext.allowTagAlerts !== true) return;
      if (
        this.shouldIgnoreCandidateSet(
          latestContext.ignored,
          candidates.candidates,
        )
      ) {
        return;
      }

      const cfg = this.api.config.get("autododge");
      if (cfg?.enabled && cfg.dodgeTags) {
        await this.handleDodge(candidates.senderName, null, tags);
        return;
      }

      await this.showTagAlertForPlayer(candidates.senderName, tags);
    } catch (err) {
      this.api.debugLog?.(
        `[ChatHandler] checkAndShowTagAlert failed for ${playerName}: ${err.message}`,
      );
    }
  }

  shouldDodgePlayer(stats) {
    const cfg = this.api.config.get("autododge");
    if (!cfg || !cfg.enabled) return false;

    if (cfg.dodgeNicks && stats?.isNicked) return true;

    const minFkdr = this.getNumericThreshold(cfg.minFkdr, (value) =>
      parseFloat(value),
    );
    if (
      !stats?.isNicked &&
      minFkdr !== null &&
      stats?.fkdr !== undefined &&
      stats.fkdr > minFkdr
    ) {
      return true;
    }

    const minWins = this.getNumericThreshold(cfg.minWins, (value) =>
      parseInt(value, 10),
    );
    if (
      !stats?.isNicked &&
      minWins !== null &&
      stats?.wins !== undefined &&
      stats.wins > minWins
    ) {
      return true;
    }

    const minStars = this.getNumericThreshold(cfg.minStars, (value) =>
      parseInt(value, 10),
    );
    if (
      !stats?.isNicked &&
      minStars !== null &&
      stats?.stars !== undefined &&
      stats.stars > minStars
    ) {
      return true;
    }

    const minWs = this.getNumericThreshold(cfg.minWs, (value) =>
      parseInt(value, 10),
    );
    if (
      !stats?.isNicked &&
      minWs !== null &&
      stats?.winstreak !== undefined &&
      stats.winstreak > minWs
    ) {
      return true;
    }

    const minFinals = this.getNumericThreshold(cfg.minFinals, (value) =>
      parseInt(value, 10),
    );
    if (
      !stats?.isNicked &&
      minFinals !== null &&
      stats?.final_kills !== undefined &&
      stats.final_kills > minFinals
    ) {
      return true;
    }

    return false;
  }

  async handleMapDodge(mapName) {
    const cfg = this.getAutododgeConfig();
    if (!cfg.enabled || !cfg.dodgeMaps?.enabled) return;

    const result = this.processAutododge(`map:${mapName}`);
    if (!result.executed) return;

    this.api.chat(
      messages.autododge.dodgingMap(mapName),
    );
  }

  async handleDodge(playerName, stats, tags) {
    const cfg = this.api.config.get("autododge");
    if (!cfg || !cfg.enabled) return;

    const result = this.processAutododge(`player:${playerName}`);
    if (!result.executed) return;

    if (tags && tags.length > 0) {
      const tagNames = tags
        .map((tag) =>
          tag.type ? tag.type.replace(/_/g, " ") : (tag.clientTag || "?"),
        )
        .join(", ");
      this.api.chat(
        messages.autododge.dodgingTagged(playerName, tagNames),
      );
    } else {
      this.api.chat(
        messages.autododge.dodgingStats(
          playerName,
          stats?.fkdr?.toFixed(2) || "?",
          stats?.wins || "?",
          stats?.stars || "?",
        ),
      );
    }
  }

  async showTagAlertForPlayer(playerName, tags) {
    const renderedMessages = renderTagAlert(
      playerName,
      tags,
      this.wildtabInstance.commandHandler.wrapText.bind(
        this.wildtabInstance.commandHandler,
      ),
    );
    for (const message of renderedMessages) {
      this.api.chat(message);
    }
  }
}

module.exports = ChatHandler;
