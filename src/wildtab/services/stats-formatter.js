const messages = require("../messages");

const PRESTIGE_STYLES = [
  { bucket: 0, symbol: "✫", leftBracket: "§7", rightBracket: "§7", digitColors: "§7", symbolColor: "§7" },
  { bucket: 100, symbol: "✫", leftBracket: "§f", rightBracket: "§f", digitColors: "§f", symbolColor: "§f" },
  { bucket: 200, symbol: "✫", leftBracket: "§6", rightBracket: "§6", digitColors: "§6", symbolColor: "§6" },
  { bucket: 300, symbol: "✫", leftBracket: "§b", rightBracket: "§b", digitColors: "§b", symbolColor: "§b" },
  { bucket: 400, symbol: "✫", leftBracket: "§2", rightBracket: "§2", digitColors: "§2", symbolColor: "§2" },
  { bucket: 500, symbol: "✫", leftBracket: "§3", rightBracket: "§3", digitColors: "§3", symbolColor: "§3" },
  { bucket: 600, symbol: "✫", leftBracket: "§c", rightBracket: "§c", digitColors: "§c", symbolColor: "§c" },
  { bucket: 700, symbol: "✫", leftBracket: "§d", rightBracket: "§d", digitColors: "§d", symbolColor: "§d" },
  { bucket: 800, symbol: "✫", leftBracket: "§9", rightBracket: "§9", digitColors: "§9", symbolColor: "§9" },
  { bucket: 900, symbol: "✫", leftBracket: "§5", rightBracket: "§5", digitColors: "§5", symbolColor: "§5" },
  { bucket: 1000, symbol: "✫", leftBracket: "§c", rightBracket: "§5", digitColors: ["§6", "§e", "§a", "§b"], symbolColor: "§d" },
  { bucket: 1100, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§f", symbolColor: "§7" },
  { bucket: 1200, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§e", symbolColor: "§6" },
  { bucket: 1300, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§b", symbolColor: "§3" },
  { bucket: 1400, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§a", symbolColor: "§2" },
  { bucket: 1500, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§3", symbolColor: "§9" },
  { bucket: 1600, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§c", symbolColor: "§4" },
  { bucket: 1700, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§d", symbolColor: "§5" },
  { bucket: 1800, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: "§9", symbolColor: "§1" },
  { bucket: 1900, symbol: "✪", leftBracket: "§8", rightBracket: "§7", digitColors: "§5", symbolColor: "§8" },
  { bucket: 2000, symbol: "✪", leftBracket: "§8", rightBracket: "§8", digitColors: ["§7", "§f", "§f", "§7"], symbolColor: "§7" },
  { bucket: 2100, symbol: "⚝", leftBracket: "§7", rightBracket: "§6", digitColors: ["§7", "§e", "§e", "§6"], symbolColor: "§6" },
  { bucket: 2200, symbol: "⚝", leftBracket: "§7", rightBracket: "§3", digitColors: ["§7", "§3", "§3", "§3"], symbolColor: "§3" },
  { bucket: 2300, symbol: "⚝", leftBracket: "§5", rightBracket: "§e", digitColors: ["§5", "§d", "§6", "§e"], symbolColor: "§e" },
  { bucket: 2400, symbol: "⚝", leftBracket: "§b", rightBracket: "§8", digitColors: ["§b", "§f", "§8", "§8"], symbolColor: "§8" },
  { bucket: 2500, symbol: "⚝", leftBracket: "§7", rightBracket: "§2", digitColors: ["§7", "§a", "§2", "§2"], symbolColor: "§2" },
  { bucket: 2600, symbol: "⚝", leftBracket: "§4", rightBracket: "§5", digitColors: ["§4", "§c", "§d", "§5"], symbolColor: "§5" },
  { bucket: 2700, symbol: "⚝", leftBracket: "§6", rightBracket: "§8", digitColors: ["§6", "§7", "§8", "§8"], symbolColor: "§8" },
  { bucket: 2800, symbol: "⚝", leftBracket: "§a", rightBracket: "§e", digitColors: ["§a", "§2", "§6", "§e"], symbolColor: "§e" },
  { bucket: 2900, symbol: "⚝", leftBracket: "§b", rightBracket: "§1", digitColors: ["§b", "§3", "§9", "§1"], symbolColor: "§1" },
  { bucket: 3000, symbol: "⚝", leftBracket: "§e", rightBracket: "§4", digitColors: ["§e", "§6", "§c", "§4"], symbolColor: "§4" },
  { bucket: 3100, symbol: "✥", leftBracket: "§9", rightBracket: "§e", digitColors: ["§9", "§3", "§6", "§e"], symbolColor: "§6" },
  { bucket: 3200, symbol: "✥", leftBracket: "§c", rightBracket: "§c", digitColors: ["§4", "§7", "§7", "§4"], symbolColor: "§c" },
  { bucket: 3300, symbol: "✥", leftBracket: "§9", rightBracket: "§4", digitColors: ["§9", "§d", "§c", "§c"], symbolColor: "§4" },
  { bucket: 3400, symbol: "✥", leftBracket: "§2", rightBracket: "§2", digitColors: ["§a", "§d", "§d", "§5"], symbolColor: "§5" },
  { bucket: 3500, symbol: "✥", leftBracket: "§c", rightBracket: "§a", digitColors: ["§4", "§4", "§2", "§a"], symbolColor: "§a" },
  { bucket: 3600, symbol: "✥", leftBracket: "§a", rightBracket: "§1", digitColors: ["§a", "§b", "§9", "§9"], symbolColor: "§1" },
  { bucket: 3700, symbol: "✥", leftBracket: "§4", rightBracket: "§3", digitColors: ["§4", "§c", "§b", "§3"], symbolColor: "§3" },
  { bucket: 3800, symbol: "✥", leftBracket: "§1", rightBracket: "§1", digitColors: ["§9", "§5", "§5", "§d"], symbolColor: "§d" },
  { bucket: 3900, symbol: "✥", leftBracket: "§c", rightBracket: "§9", digitColors: ["§c", "§a", "§3", "§9"], symbolColor: "§9" },
  { bucket: 4000, symbol: "✥", leftBracket: "§5", rightBracket: "§e", digitColors: ["§5", "§c", "§6", "§e"], symbolColor: "§e" },
  { bucket: 4100, symbol: "✥", leftBracket: "§5", rightBracket: "§5", digitColors: ["§6", "§c", "§d", "§d"], symbolColor: "§d" },
  { bucket: 4200, symbol: "✥", leftBracket: "§1", rightBracket: "§7", digitColors: ["§9", "§3", "§b", "§f"], symbolColor: "§7" },
  { bucket: 4300, symbol: "✥", leftBracket: "§8", rightBracket: "§8", digitColors: ["§5", "§7", "§7", "§5"], symbolColor: "§5" },
  { bucket: 4400, symbol: "✥", leftBracket: "§2", rightBracket: "§8", digitColors: ["§a", "§e", "§6", "§5"], symbolColor: "§5" },
  { bucket: 4500, symbol: "✥", leftBracket: "§f", rightBracket: "§3", digitColors: ["§f", "§b", "§b", "§3"], symbolColor: "§3" },
  { bucket: 4600, symbol: "✥", leftBracket: "§3", rightBracket: "§5", digitColors: ["§b", "§e", "§6", "§6"], symbolColor: "§5" },
  { bucket: 4700, symbol: "✥", leftBracket: "§f", rightBracket: "§9", digitColors: ["§4", "§c", "§9", "§9"], symbolColor: "§1" },
  { bucket: 4800, symbol: "✥", leftBracket: "§5", rightBracket: "§3", digitColors: ["§c", "§6", "§e", "§b"], symbolColor: "§b" },
  { bucket: 4900, symbol: "✥", leftBracket: "§2", rightBracket: "§2", digitColors: ["§a", "§f", "§f", "§a"], symbolColor: "§a" },
  { bucket: 5000, symbol: "✥", leftBracket: "§4", rightBracket: "§1", digitColors: ["§5", "§9", "§9", "§1"], symbolColor: "§1" },
];

class StatsFormatter {
  constructor(api) {
    this.api = api;
  }

  resolvePrestigeSpec(stars) {
    const numericStars = Number(stars);
    if (!Number.isFinite(numericStars)) return null;

    const clamped = Math.min(5000, Math.max(0, Math.floor(numericStars)));
    const bucket = Math.floor(clamped / 100) * 100;
    return PRESTIGE_STYLES.find((style) => style.bucket === bucket) || PRESTIGE_STYLES[PRESTIGE_STYLES.length - 1];
  }

  applyDigitPattern(digitsText, digitColors) {
    if (!Array.isArray(digitColors)) {
      return [...digitsText].map((digit) => `${digitColors}${digit}`).join("");
    }
    return [...digitsText]
      .map((digit, index) => `${digitColors[Math.min(index, digitColors.length - 1)]}${digit}`)
      .join("");
  }

  colorizeStarToken(digitsText, style) {
    const rightBracket = style.rightBracket || style.leftBracket;
    const coloredDigits = this.applyDigitPattern(digitsText, style.digitColors);
    return `${style.leftBracket}[${coloredDigits}${style.symbolColor}${style.symbol}${rightBracket}]`;
  }

  formatPrestigeStars(stars) {
    const numericStars = Number(stars);
    if (!Number.isFinite(numericStars)) return "§c[???✫]";

    const normalized = Math.max(0, Math.floor(numericStars));
    const style = this.resolvePrestigeSpec(normalized);
    if (!style) return "§c[???✫]";

    return this.colorizeStarToken(String(normalized), style);
  }

  applyColor(field, value) {
    if (value === undefined || value === null) return "§c";

    const fieldKey = String(field || "").toLowerCase();
    if (fieldKey === "ping") {
      const ping = Number(value);
      if (!Number.isFinite(ping)) return "§c";
      if (ping <= 50) return "§a";
      if (ping <= 100) return "§2";
      if (ping <= 150) return "§e";
      if (ping < 200) return "§c";
      return "§4";
    }

    const defaults = {
      fkdr: [
        { max: 1, color: "§7" },
        { max: 2, color: "§f" },
        { max: 5, color: "§a" },
        { max: 10, color: "§2" },
        { max: 20, color: "§c" },
        { min: 20, color: "§4" },
      ],
      winstreak: [
        { max: 0, color: "§7" },
        { max: 4, color: "§f" },
        { max: 14, color: "§a" },
        { max: 49, color: "§2" },
        { max: 99, color: "§c" },
        { min: 100, color: "§4" },
      ],
      wl: [
        { max: 0.99, color: "§7" },
        { max: 1.99, color: "§f" },
        { max: 2.99, color: "§a" },
        { max: 4.99, color: "§2" },
        { max: 9.99, color: "§c" },
        { min: 10, color: "§4" },
      ],
      finals: [
        { max: 99, color: "§7" },
        { max: 999, color: "§f" },
        { max: 4999, color: "§a" },
        { max: 19999, color: "§2" },
        { max: 49999, color: "§c" },
        { min: 50000, color: "§4" },
      ],
      wins: [
        { max: 49, color: "§7" },
        { max: 199, color: "§f" },
        { max: 999, color: "§a" },
        { max: 4999, color: "§2" },
        { max: 9999, color: "§c" },
        { min: 10000, color: "§4" },
      ],
    };

    const fieldDefaults = defaults[fieldKey];
    if (fieldDefaults) {
      for (const rule of fieldDefaults) {
        if (
          (rule.min === undefined || value >= rule.min) &&
          (rule.max === undefined || value <= rule.max)
        ) {
          return rule.color;
        }
      }
    }
    return "§f";
  }

  getVisualLength(str) {
    return str.replace(/§[0-9a-fk-or]/g, "").length;
  }

  padLeft(valueStr, maxWidth) {
    const diff = maxWidth - valueStr.length;
    if (diff <= 0) return valueStr;
    return "§r §r ".repeat(diff) + valueStr;
  }

  formatWinstreakValue(winstreak, isEstimated = false) {
    if (winstreak === undefined || winstreak === null) return "?";
    return isEstimated ? `e${winstreak}` : `${winstreak}`;
  }

  shouldColorPing() {
    return this.api.config.get("tab.colorPing") !== false;
  }

  formatPingColor(ping) {
    return this.shouldColorPing() ? this.applyColor("ping", ping) : "§7";
  }

  formatStats(stats, maxWidths = {}, options = {}) {
    const {
      starMax = 0,
      fkdrMax = 0,
      wlMax = 0,
      finalsMax = 0,
      winsMax = 0,
      wsMax = 0,
      pingMax = 0,
    } = maxWidths;
    const { teamColor = "§f", tag = "" } = options;
    const resolvedTeamColor = teamColor || "§f";
    const isLoading = !stats || stats.isLoading === true;
    const isNicked = !!stats?.isNicked;

    const showStars = this.api.config.get("tab.showStars");
    const showFkdr = this.api.config.get("tab.showFkdr");
    const showWl = this.api.config.get("tab.showWl");
    const showFinals = this.api.config.get("tab.showFinals");
    const showWins = this.api.config.get("tab.showWins");
    const showWs = this.api.config.get("tab.showWs");
    const showPing = this.api.config.get("tab.showPing");

    let starStr,
      fkdrColor,
      fkdrRaw,
      wlColor,
      wlRaw,
      finalsColor,
      finalsRaw,
      winsColor,
      winsRaw,
      wsColor,
      wsRaw,
      pingColor,
      pingRaw;

    if (isNicked) {
      starStr = "§c[???✫]";
      fkdrColor = "§c";
      fkdrRaw = "?.?";
      wlColor = "§c";
      wlRaw = "?.?";
      finalsColor = "§c";
      finalsRaw = "?";
      winsColor = "§c";
      winsRaw = "?";
      wsColor = "§c";
      wsRaw = "?";
      pingColor = "§c";
      pingRaw = "?";
    } else if (isLoading) {
      starStr = "§8[---✫]";
      fkdrColor = "§8";
      fkdrRaw = "-.-";
      wlColor = "§8";
      wlRaw = "-.-";
      finalsColor = "§8";
      finalsRaw = "-";
      winsColor = "§8";
      winsRaw = "-";
      wsColor = "§8";
      wsRaw = "-";
      pingColor = "§8";
      pingRaw = "-";
    } else {
      if (showStars) {
        starStr =
          stats.stars !== undefined && stats.stars !== null
            ? this.formatPrestigeStars(stats.stars)
            : "§c[???✫]";
      } else {
        starStr = "";
      }

      if (showFkdr) {
        fkdrColor = this.applyColor("fkdr", stats.fkdr);
        fkdrRaw =
          stats.fkdr !== undefined && stats.fkdr !== null
            ? stats.fkdr.toFixed(1)
            : "?";
      } else {
        fkdrColor = "§f";
        fkdrRaw = "";
      }

      if (showWl) {
        wlColor = this.applyColor("wl", stats.wl);
        wlRaw =
          stats.wl !== undefined && stats.wl !== null
            ? stats.wl.toFixed(1)
            : "?";
      } else {
        wlColor = "§f";
        wlRaw = "";
      }

      if (showFinals) {
        finalsColor = this.applyColor("finals", stats.final_kills);
        finalsRaw =
          stats.final_kills !== undefined && stats.final_kills !== null
            ? `${stats.final_kills}/${stats.final_deaths}`
            : "?";
      } else {
        finalsColor = "§f";
        finalsRaw = "";
      }

      if (showWins) {
        winsColor = this.applyColor("wins", stats.wins);
        winsRaw =
          stats.wins !== undefined && stats.wins !== null
            ? stats.wins.toString()
            : "?";
      } else {
        winsColor = "§f";
        winsRaw = "";
      }

      if (showWs) {
        if (stats.winstreakPending === true) {
          wsColor = "§8";
          wsRaw = "-";
        } else {
          wsColor = this.applyColor("winstreak", stats.winstreak);
          wsRaw =
            stats.winstreak !== undefined && stats.winstreak !== null
              ? this.formatWinstreakValue(
                stats.winstreak,
                stats.winstreakEstimated === true,
              )
              : "?";
        }
      } else {
        wsColor = "§f";
        wsRaw = "";
      }

      if (showPing) {
        if (stats.pingPending === true) {
          pingColor = "§8";
          pingRaw = "-";
        } else {
          const pingKnown = stats.ping !== undefined && stats.ping !== null;
          pingColor = pingKnown ? this.formatPingColor(stats.ping) : "§7";
          pingRaw = pingKnown ? Math.round(stats.ping).toString() : "?";
        }
      } else {
        pingColor = "§f";
        pingRaw = "";
      }
    }

    const starVisualLength = this.getVisualLength(starStr);
    const starSpaces = showStars
      ? "§r §r ".repeat(Math.max(0, starMax - starVisualLength))
      : "";

    const fkdrPad = showFkdr
      ? "§r §r ".repeat(Math.max(0, fkdrMax - fkdrRaw.length))
      : "";
    const wlPad = showWl
      ? "§r §r ".repeat(Math.max(0, wlMax - wlRaw.length))
      : "";
    const finalsPad = showFinals
      ? "§r §r ".repeat(Math.max(0, finalsMax - finalsRaw.length))
      : "";
    const winsPad = showWins
      ? "§r §r ".repeat(Math.max(0, winsMax - winsRaw.length))
      : "";
    const wsPad = showWs
      ? "§r §r ".repeat(Math.max(0, wsMax - wsRaw.length))
      : "";
    const pingPad = showPing
      ? "§r §r ".repeat(Math.max(0, pingMax - pingRaw.length))
      : "";

    const tagStr = isNicked ? "" : tag ? ` ${tag}` : "";
    const spaceAfterBar = "§r ";

    let prefix = "";

    if (showStars) {
      prefix += `${starSpaces}${starStr} `;
    }
    if (showFkdr) {
      prefix += `${fkdrPad}${fkdrColor}${fkdrRaw} §7fkdr`;
    }
    if (showFkdr && (showWl || showFinals || showWins || showWs || showPing)) {
      prefix += ", ";
    }
    if (showWl) {
      prefix += `${wlPad}${wlColor}${wlRaw} §7wl`;
    }
    if (showWl && (showFinals || showWins || showWs || showPing)) {
      prefix += ", ";
    }
    if (showFinals) {
      prefix += `${finalsPad}${finalsColor}${finalsRaw} §7finals`;
    }
    if (showFinals && (showWins || showWs || showPing)) {
      prefix += ", ";
    }
    if (showWins) {
      prefix += `${winsPad}${winsColor}${winsRaw} §fwins`;
    }
    if (showWins && (showWs || showPing)) {
      prefix += ", ";
    }
    if (showWs) {
      prefix += `${wsPad}${wsColor}${wsRaw} §7ws`;
    }
    if (showWs && showPing) {
      prefix += ", ";
    }
    if (showPing) {
      prefix += `${pingPad}${pingColor}${pingRaw}§7ms`;
    }
    if (showWs || showPing) {
      prefix += ` §8|${spaceAfterBar}${resolvedTeamColor}`;
    }

    return {
      prefix: prefix,
      suffix: tagStr,
    };
  }

  formatStatsMessage(playerName, stats) {
    const showStars = this.api.config.get("tab.showStars");
    const showFkdr = this.api.config.get("tab.showFkdr");
    const showWl = this.api.config.get("tab.showWl");
    const showFinals = this.api.config.get("tab.showFinals");
    const showWins = this.api.config.get("tab.showWins");
    const showWs = this.api.config.get("tab.showWs");
    const showPing = this.api.config.get("tab.showPing");

    if (!stats) {
      return messages.error.statsFetchInline(playerName);
    }

    if (stats.isNicked) {
      return messages.stats.nickedInline(playerName);
    }

    const segments = [];

    if (showStars) {
      segments.push(this.formatPrestigeStars(stats.stars));
    }
    if (showFkdr) {
      const fkdrColor = this.applyColor("fkdr", stats.fkdr);
      segments.push(`${messages.stats.labelFkdr}${fkdrColor}${stats.fkdr.toFixed(1)}`);
    }
    if (showWl) {
      const wlColor = this.applyColor("wl", stats.wl);
      segments.push(`${messages.stats.labelWl}${wlColor}${stats.wl.toFixed(1)}`);
    }
    if (showFinals) {
      const finalsColor = this.applyColor("finals", stats.final_kills);
      segments.push(
        `${messages.stats.labelFinals}${finalsColor}${stats.final_kills}/${stats.final_deaths}`,
      );
    }
    if (showWins) {
      const winsColor = this.applyColor("wins", stats.wins);
      segments.push(`${messages.stats.labelWins}${winsColor}${stats.wins}`);
    }
    if (showWs) {
      const wsKnown =
        stats.winstreak !== undefined && stats.winstreak !== null;
      const wsPending = stats.winstreakPending === true;
      const wsColor = wsPending
        ? "§8"
        : wsKnown
        ? this.applyColor("winstreak", stats.winstreak)
        : "§c";
      const wsDisplay = wsPending
        ? "-"
        : wsKnown
        ? this.formatWinstreakValue(
          stats.winstreak,
          stats.winstreakEstimated === true,
        )
        : "?";
      segments.push(`${messages.stats.labelWs}${wsColor}${wsDisplay}`);
    }
    if (showPing) {
      const pingKnown = stats.ping !== undefined && stats.ping !== null;
      const pingPending = stats.pingPending === true;
      const pingColor = pingPending
        ? "§8"
        : pingKnown ? this.formatPingColor(stats.ping) : "§7";
      const pingDisplay = pingPending
        ? "-"
        : pingKnown ? Math.round(stats.ping).toString() : "?";
      segments.push(`${messages.stats.labelPing}${pingColor}${pingDisplay}ms`);
    }

    return `${messages.stats.summaryHeader(playerName)}${segments.join(messages.stats.divider)}`;
  }
}

module.exports = StatsFormatter;
