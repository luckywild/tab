const STYLE = {
  prefix: "§9[wt]§r ",
  error: "§c",
  warn: "§e",
  info: "§f",
  secondary: "§7",
  success: "§a",
  muted: "§8",
  accent: "§f",
  label: "§7",
  title: "§f",
  subtle: "§7",
  providerUrchin: "§d",
  providerSeraph: "§b",
  reset: "§r",
};

function providerColor(provider) {
  const normalized = String(provider || "").toLowerCase();
  if (normalized === "urchin") return STYLE.providerUrchin;
  if (normalized === "seraph") return STYLE.providerSeraph;
  return STYLE.accent;
}

function humanizeProvider(provider) {
  const text = String(provider || "");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "Unknown";
}

function coloredProviders(providers) {
  return providers
    .map((provider) => `${providerColor(provider)}${humanizeProvider(provider)}`)
    .join(`${STYLE.secondary}, `);
}

function colorizeMultiline(text, color) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  return normalized
    .split("\n")
    .map((line) => `${color}${line}`)
    .join("\n");
}

function colorizeByWord(text, color) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  return normalized
    .split("\n")
    .map((line) =>
      line
        .split(" ")
        .map((word) => (word ? `${color}${word}` : word))
        .join(" "),
    )
    .join(`\n${color}`);
}

function withPrefix(text, tone = STYLE.info) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  return normalized
    .split("\n")
    .map((line) => `${STYLE.prefix}${tone}${line}`)
    .join("\n");
}

function prefixedBase(text) {
  return withPrefix(text, STYLE.info);
}

function prefixedMuted(text) {
  return withPrefix(text, STYLE.muted);
}

function prefixedWarn(text) {
  return withPrefix(text, STYLE.warn);
}

function prefixedError(text) {
  return withPrefix(text, STYLE.error);
}

function prefixedSuccess(text) {
  return withPrefix(text, STYLE.success);
}

const messages = {
  STYLE,
  utility: {
    providerColor,
    humanizeProvider,
    coloredProviders,
    colorizeMultiline,
    colorizeByWord,
    withPrefix,
    prefixedBase,
    prefixedMuted,
    prefixedWarn,
    prefixedError,
    prefixedSuccess,
  },
  error: {
    usageTags: prefixedError("Usage: /wildtab tags <player>"),
    noApiKeyConfigured: "No API key configured",
    disabledInConfig: "Disabled in config",
    tagsLookup: (error) =>
      prefixedError(
        `Error checking tags: ${colorizeMultiline(error, STYLE.error)}`,
      ),
    statsFetch: (playerName) =>
      prefixedError(`Failed to fetch stats for ${playerName}`),
    statsFetchInline: (playerName) =>
      prefixedError(`Failed to fetch stats for ${playerName}`),
  },
  info: {
    lookingUpTags: prefixedMuted("Looking up tags.."),
    testingApis: prefixedMuted("Testing APIs..."),
    tagsNotFound: prefixedError("That player has not been tagged."),
    apiSkipped: (name, error) =>
      prefixedMuted(
        `- ${name} API skipped ${STYLE.secondary}(${colorizeMultiline(error, STYLE.secondary)})`,
      ),
    apiOk: (name) => prefixedSuccess(`✓ ${name} API working`),
    apiDown: (name, error) =>
      prefixedError(
        `✗ ${name} API not working ${STYLE.secondary}(${colorizeMultiline(error, STYLE.secondary)})`,
      ),
  },
  autododge: {
    apiDownTop: prefixedError(""),
    apiDownBottom: prefixedError(""),
    apiDownPadTop: prefixedMuted(""),
    apiDownPadBottom: prefixedMuted(""),
    apiDownHeader: prefixedError("✗ One or more APIs is down!"),
    apiDownLine: (name, error) =>
      prefixedError(
        `✗ ${name} API not working ${STYLE.secondary}(${colorizeMultiline(error || "Unknown error", STYLE.secondary)})`,
      ),
    queuedRequeueCleared: prefixedWarn(
      `Cleared queued ${STYLE.accent}/requeue${STYLE.warn} because the game started.`,
    ),
    queuedRequeueUnsafeHub:
      prefixedWarn(
        `Queued ${STYLE.accent}/requeue${STYLE.warn} is no longer safe. Using ${STYLE.accent}/hub${STYLE.warn} instead.`,
      ),
    requeueAttempt: prefixedWarn(
      `Trying ${STYLE.accent}/requeue${STYLE.warn} before fallback hub.`,
    ),
    requeueAttemptRetry:
      prefixedWarn(
        `Requeue still not confirmed after 5s. Retrying ${STYLE.accent}/requeue${STYLE.warn}.`,
      ),
    requeueBackupArmed: prefixedWarn(
      `Backup ${STYLE.accent}/hub${STYLE.warn} armed for 1s before game start.`,
    ),
    requeueConfirmed: prefixedSuccess(
      `Requeue confirmed. Cancelled backup ${STYLE.accent}/hub${STYLE.success}.`,
    ),
    requeueFallbackHub: prefixedWarn(
      `Requeue not confirmed in time. Falling back to ${STYLE.accent}/hub${STYLE.warn}.`,
    ),
    requeueFallbackPlay: (mode) =>
      prefixedSuccess(
        `Rejoining queue with ${STYLE.accent}/play ${mode}${STYLE.success}.`,
      ),
    requeueFallbackPlayUnknown:
      prefixedWarn(
        "Fallback /hub completed, but last queue mode is unknown so /play was skipped.",
      ),
    directHubRequeueDisabled:
      prefixedWarn(
        `Requeue is disabled. Dodging via ${STYLE.accent}/hub${STYLE.warn}.`,
      ),
    locrawParseFailed: prefixedWarn(
      "Failed to parse /locraw response.",
    ),
    dodgingMap: (mapName) =>
      prefixedError(
        `Dodging map ${STYLE.accent}${mapName}${STYLE.error} (matched dodge map list).`,
      ),
    dodgingTagged: (playerName, tagNames) =>
      prefixedError(
        `Dodging tagged player ${STYLE.accent}${playerName}${STYLE.error} (Tags: ${tagNames})`,
      ),
    dodgingStats: (playerName, fkdr, wins, stars) =>
      prefixedError(
        `Dodging due to ${STYLE.accent}${playerName}${STYLE.error} (fkdr ${fkdr}, wins ${wins}, stars ${stars})`,
      ),
  },
  tags: {
    noContext: "No context",
    mainLine: (playerName, displayTagType, coloredProviderNames) =>
      prefixedBase(
        `${STYLE.error}⚠ ${STYLE.error}${playerName} ${STYLE.secondary}tagged as §4${displayTagType} ${STYLE.secondary}by ${coloredProviderNames}${STYLE.secondary}.`,
      ),
    hoverTitle: (playerName) =>
      `${STYLE.error}Tags for ${STYLE.accent}${playerName}\n`,
    hoverSeparator: `${STYLE.info}§m-------------------------------------${STYLE.reset}`,
    hoverItem: (providerType, coloredProviderName) =>
      `${STYLE.title}• ${providerType} ${STYLE.info}by ${coloredProviderName}\n`,
    hoverReason: (line) => `${STYLE.info}§o${line}\n`,
    clickSuggest: (playerName, displayTagType) =>
      `/pc ${playerName} is tagged as ${displayTagType}.`,
    immediateItem: (providerType, coloredProviderName, reason) =>
      prefixedBase(
        `${STYLE.error}${providerType} ${STYLE.secondary}by ${coloredProviderName}${STYLE.secondary}: ${colorizeByWord(reason, "§7§o")}`,
      ),
    singleLineReason: (reason, fallback = "No context") => {
      if (typeof reason !== "string") return fallback;
      const compact = reason.replace(/\s+/g, " ").trim();
      return compact.length > 0 ? compact : fallback;
    },
    reasonInline: (reason) => prefixedBase(colorizeByWord(reason, "§7§o")),
  },
  rush: {
    localSummary: (summary) => prefixedBase(summary),
    targetSummary: (segments) => {
      if (!Array.isArray(segments) || segments.length === 0) {
        return `${STYLE.secondary}target: ${STYLE.muted}unknown`;
      }
      return `${STYLE.secondary}target: ${segments.join(`${STYLE.secondary}, `)}`;
    },
  },
  stats: {
    nickedInline: (playerName) =>
      prefixedWarn(`${STYLE.accent}${playerName} ${STYLE.secondary}is nicked (cannot fetch stats)`),
    summaryHeader: (playerName) =>
      prefixedBase(`${STYLE.accent}${playerName}${STYLE.secondary} - `),
    labelFkdr: `${STYLE.secondary}fkdr `,
    labelWl: `${STYLE.secondary}wl `,
    labelWins: `${STYLE.secondary}wins `,
    labelFinals: `${STYLE.secondary}finals `,
    labelWs: `${STYLE.secondary}ws `,
    labelPing: `${STYLE.secondary}ping `,
    divider: `${STYLE.secondary}, `,
  },
};

module.exports = messages;
