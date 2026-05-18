const https = require("https");
const TagProvider = require("../provider");

class UrchinApi extends TagProvider {
  constructor(api, cache) {
    super(api, cache);
    this.providerName = "urchin";
    this.providerColor = "§d";
    this.REQUEST_TIMEOUT_MS = 4000;
  }

  getApiKey() {
    const apiKey = this.api.config.get("api.urchin.key");
    return typeof apiKey === "string" ? apiKey.trim() : "";
  }

  hasApiKey() {
    return this.getApiKey().length > 0;
  }

  buildPlayerPath(playerName, apiKey, sources = "MANUAL") {
    return `/player/${encodeURIComponent(playerName)}?key=${encodeURIComponent(apiKey)}&sources=${encodeURIComponent(sources)}`;
  }

  normalizeTagsResponse(response, playerName) {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.tags)) return response.tags;
    if (Array.isArray(response?.data?.tags)) return response.data.tags;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.blacklist)) return response.blacklist;

    const players = response?.players;
    if (players && typeof players === "object") {
      return players[playerName] || players[String(playerName).toLowerCase()] || [];
    }

    return [];
  }

  async getTagsWithCache(playerName) {
    if (!this.hasApiKey()) {
      console.error("[Urchin API] No API key configured");
      return [];
    }

    return super.getTagsWithCache(playerName);
  }

  async getTags(playerName) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.error("[Urchin API] No API key configured");
      return [];
    }

    try {
      const response = await this.checkTags(playerName, apiKey);
      return this.normalizeTagsResponse(response, playerName);
    } catch (err) {
      console.error(`[Urchin API] Error fetching tags: ${err.message}`);
      return [];
    }
  }

  async checkTags(playerName, apiKey = this.getApiKey()) {
    if (!playerName) return {};
    if (!apiKey) {
      throw new Error("No API key configured");
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "urchin.ws",
        path: this.buildPlayerPath(playerName, apiKey),
        method: "GET",
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = data ? JSON.parse(data) : {};
            const detail =
              response && typeof response.detail === "string" ? response.detail : "";

            if (response === "Invalid Key" || detail === "Invalid Key") {
              throw new Error("Invalid API Key");
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
              throw new Error(detail || `HTTP ${res.statusCode}`);
            }
            resolve(response);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });
      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error("Urchin request timed out"));
      });

      req.end();
    });
  }

  getCachedTags(playerName) {
    const cached = this.cache?.getUrchinTags(playerName);
    return cached ?? null;
  }

  setCachedTags(playerName, tags) {
    this.cache?.setUrchinTags(playerName, tags);
  }

  getTagIcon(type) {
    const icons = {
      info: "I",
      caution: "C",
      closet_cheater: "CC",
      blatant_cheater: "BC",
      confirmed_cheater: "CCC",
      account: "A",
      possible_sniper: "PS",
      sniper: "S",
      legit_sniper: "LS",
    };
    return icons[type] || "?";
  }

  getTagColor(type) {
    const colors = {
      info: "7",
      closet_cheater: "6",
      blatant_cheater: "6",
      account: "6",
      caution: "6",
      confirmed_cheater: "5",
      sniper: "4",
      legit_sniper: "c",
      possible_sniper: "c",
    };
    return colors[type] || "f";
  }

  getSupportedTags() {
    return [
      "sniper",
      "possible_sniper",
      "legit_sniper",
      "closet_cheater",
      "blatant_cheater",
      "confirmed_cheater",
      "caution",
      "account",
      "info",
    ];
  }

  mapToClientTag(providerTagType) {
    const mapping = {
      sniper: "SNIPER",
      possible_sniper: "POTENTIAL_SNIPER",
      legit_sniper: "LEGIT_SNIPER",
      closet_cheater: "CLOSET_CHEATER",
      blatant_cheater: "BLATANT_CHEATER",
      confirmed_cheater: "BLATANT_CHEATER",
      caution: "CAUTION",
      account: "ALT_ACCOUNT",
      info: "CAUTION",
    };
    return mapping[providerTagType] || null;
  }
}

module.exports = UrchinApi;
