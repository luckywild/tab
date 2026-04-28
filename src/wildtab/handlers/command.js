const messages = require("../messages");
const { renderTagAlert } = require("../services/tag-alert-renderer");

class CommandHandler {
  constructor(api, wildtabInstance) {
    this.api = api;
    this.wildtabInstance = wildtabInstance;
  }

  async testHypixelApi() {
    const apiKey = this.api.config.get("api.hypixel.key");
    if (!apiKey) {
      return { success: false, error: messages.error.noApiKeyConfigured };
    }
    try {
      const response = await fetch(
        "https://api.hypixel.net/v2/player?uuid=069a79f444e94726a5befca90e38aaf5",
        { headers: { "API-Key": apiKey } },
      );
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async testUrchinApi() {
    const enabled = this.api.config.get("api.urchin.enabled") === true;
    if (!enabled) {
      return { success: true, skipped: true, error: messages.error.disabledInConfig };
    }

    const sources = "MANUAL";
    const path = `https://urchin.ws/player?sources=${sources}`;

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: ["Notch"] }),
      });
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async testSeraphApi() {
    const enabled = this.api.config.get("api.seraph.enabled") === true;
    if (!enabled) {
      return { success: true, skipped: true, error: messages.error.disabledInConfig };
    }

    const apiKey = this.api.config.get("api.seraph.key");
    if (!apiKey) {
      return { success: false, error: messages.error.noApiKeyConfigured };
    }
    try {
      const response = await fetch(
        "https://api.seraph.si/069a79f444e94726a5befca90e38aaf5/blacklist",
        { headers: { "seraph-api-key": apiKey } },
      );
      if (response.ok || response.status === 404) {
        return { success: true };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async testBordicApi() {
    const enabled = this.api.config.get("api.bordic.enabled") === true;
    if (!enabled) {
      return { success: true, skipped: true, error: messages.error.disabledInConfig };
    }

    const apiKey = this.api.config.get("api.bordic.key");
    if (!apiKey) {
      return { success: false, error: messages.error.noApiKeyConfigured };
    }

    const uuid = "069a79f444e94726a5befca90e38aaf5";
    const path = `https://bordic.xyz/api/v2/resources/winstreak?uuid=${uuid}&key=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetch(path);
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      // Bordic can return success:false when no player data is available.
      // For connectivity health checks, HTTP 2xx is sufficient.
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async runApiHealthChecks() {
    const [hypixelResult, urchinResult, seraphResult, bordicResult] = await Promise.all([
      this.testHypixelApi(),
      this.testUrchinApi(),
      this.testSeraphApi(),
      this.testBordicApi(),
    ]);

    return [
      { name: "Hypixel", ...hypixelResult },
      { name: "Urchin", ...urchinResult },
      { name: "Seraph", ...seraphResult },
      { name: "Bordic", ...bordicResult },
    ];
  }

  async handleTagsCommand(ctx) {
    const playerName = ctx.args.player;

    if (
      !playerName ||
      typeof playerName !== "string" ||
      playerName.trim().length === 0
    ) {
      this.api.chat(messages.error.usageTags);
      return;
    }

    this.api.chat(messages.info.lookingUpTags);

    const tagProviderManager = this.wildtabInstance.tagProviderManager;

    try {
      const tags = await tagProviderManager.getTagsForPlayer(playerName.trim());

      if (tags.length === 0) {
        this.api.chat(messages.info.tagsNotFound);
        return;
      }

      const renderedMessages = renderTagAlert(
        playerName,
        tags,
        this.wrapText.bind(this),
      );
      for (const message of renderedMessages) {
        this.api.chat(message);
      }
    } catch (err) {
      this.api.chat(messages.error.tagsLookup(err.message));
    }
  }

  async handleTestApisCommand(ctx) {
    this.api.chat(messages.info.testingApis);
    const results = await this.runApiHealthChecks();

    for (const result of results) {
      if (result.skipped) {
        this.api.chat(messages.info.apiSkipped(result.name, result.error));
        continue;
      }

      if (result.success) {
        this.api.chat(messages.info.apiOk(result.name));
      } else {
        this.api.chat(messages.info.apiDown(result.name, result.error));
      }
    }
  }

  emitMessageWithSpacing(message) {
    this.api.chat(message);
    this.api.chat(" ");
  }

  async handleTestMessagesCommand(ctx) {
    const samplePlayer = "wild1278";
    const sampleTagType = "BC";
    const sampleProviders = messages.utility.coloredProviders(["urchin", "seraph"]);
    const sampleReason =
      "Closet Cheating: legitscaff, blink, visuals (Upgraded) (2 weeks ago by bettloser)";

    const sampleStats = {
      stars: 327,
      fkdr: 4.6,
      wl: 2.2,
      final_kills: 1840,
      final_deaths: 420,
      wins: 612,
      winstreak: 14,
      winstreakEstimated: false,
      ping: 78,
      isNicked: false,
    };

    const chatHandler = this.wildtabInstance.chatHandler;
    const buildRushPlayer = (name, fkdr, stars, ws, options = {}) => ({
      name,
      stats: {
        fkdr,
        stars,
        winstreak: ws,
        isNicked: options.isNicked === true,
      },
      tags: Array.isArray(options.tags) ? options.tags : [],
      isSelf: options.isSelf === true,
    });

    const groupedByColor = new Map([
      ["§c", [buildRushPlayer("self_red", 2.0, 145, 8, { isSelf: true })]],
      ["§e", [buildRushPlayer("yellow_enemy", 7.1, 254, 14)]],
      ["§9", [buildRushPlayer("blue_enemy", 1.8, 121, 6)]],
      ["§a", [buildRushPlayer("green_enemy", 3.3, 188, 9)]],
    ]);
    const myTeamColor = "§c";
    const rushSummarySample = chatHandler.buildRushFirstSummaryText(
      groupedByColor,
      myTeamColor,
      "trio_quad",
    );
    const soloDuoGroupedByColor = new Map([
      ["§c", [buildRushPlayer("self_red_sd", 2.0, 145, 8, { isSelf: true })]],
      ["§9", [buildRushPlayer("side_blue_enemy", 6.4, 211, 12)]],
      ["§8", [buildRushPlayer("corner_gray_enemy", 1.2, 88, 3)]],
    ]);
    const soloDuoSummarySample = chatHandler.buildRushFirstSummaryText(
      soloDuoGroupedByColor,
      myTeamColor,
      "solo_duo",
    );

    const rankedTargets = [...groupedByColor.entries()]
      .filter(([color]) => color !== myTeamColor)
      .map(([color, teamPlayers]) => {
        const assessment = chatHandler.getTeamAverages(teamPlayers);
        return {
          color,
          teamName: chatHandler.getRushTeamName(color),
          assessment,
          score: chatHandler.getTeamScore(assessment),
        };
      })
      .sort((a, b) => b.score - a.score);
    const targetSegmentsOne = rankedTargets
      .slice(0, 1)
      .map((entry) =>
        chatHandler.formatTeamSegment(entry.teamName, entry.assessment, entry.color),
      );
    const targetSegmentsThree = rankedTargets
      .slice(0, 3)
      .map((entry) =>
        chatHandler.formatTeamSegment(entry.teamName, entry.assessment, entry.color),
      );
    const rushTargetSampleOne = messages.rush.targetSummary(targetSegmentsOne);
    const rushTargetSampleThree = messages.rush.targetSummary(targetSegmentsThree);

    const samples = [
      messages.error.usageTags,
      messages.error.statsFetch(samplePlayer),
      messages.error.tagsLookup("HTTP 503"),
      messages.info.lookingUpTags,
      messages.info.testingApis,
      messages.info.tagsNotFound,
      messages.info.apiSkipped("Urchin", "Disabled in config"),
      messages.info.apiOk("Hypixel"),
      messages.info.apiDown("Seraph", "HTTP 429"),
      messages.autododge.apiDownPadTop,
      messages.autododge.apiDownTop,
      messages.autododge.apiDownHeader,
      messages.autododge.apiDownLine("Seraph", "HTTP 429"),
      messages.autododge.apiDownBottom,
      messages.autododge.apiDownPadBottom,
      messages.autododge.queuedRequeueCleared,
      messages.autododge.queuedRequeueUnsafeHub,
      messages.autododge.requeueAttempt,
      messages.autododge.requeueAttemptRetry,
      messages.autododge.requeueBackupArmed,
      messages.autododge.requeueConfirmed,
      messages.autododge.requeueFallbackHub,
      messages.autododge.requeueFallbackPlay("bedwars_eight_two"),
      messages.autododge.requeueFallbackPlayUnknown,
      messages.autododge.directHubRequeueDisabled,
      messages.autododge.locrawParseFailed,
      messages.autododge.dodgingMap("Playground"),
      messages.autododge.dodgingTagged(samplePlayer, "closet cheater, blatant cheater"),
      messages.autododge.dodgingStats(samplePlayer, "4.60", "612", "327"),
      messages.tags.mainLine(samplePlayer, sampleTagType, sampleProviders),
      messages.tags.immediateItem("closet cheater", "§bSeraph", sampleReason),
      messages.tags.reasonInline(sampleReason),
      messages.rush.localSummary(rushSummarySample),
      messages.rush.localSummary(soloDuoSummarySample),
      messages.rush.localSummary(rushTargetSampleOne),
      messages.rush.localSummary(rushTargetSampleThree),
      messages.stats.nickedInline(samplePlayer),
      this.wildtabInstance.statsFormatter.formatStatsMessage(samplePlayer, sampleStats),
    ];

    for (const sample of samples) {
      this.emitMessageWithSpacing(sample);
    }
  }

  wrapText(text, maxLength) {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + word).length <= maxLength) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
module.exports = CommandHandler;
