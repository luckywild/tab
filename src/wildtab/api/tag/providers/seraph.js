const https = require("https");
const TagProvider = require("../provider");

class SeraphApi extends TagProvider {
  constructor(api, cache, mojangApi = null) {
    super(api, cache);
    this.providerName = "seraph";
    this.providerColor = "§b";
    this.REQUEST_TIMEOUT_MS = 4000;
    this.mojangApi = mojangApi;
  }

  async getUuid(playerName) {
    const playerFromProxy = this.api.getPlayerByName(playerName);
    if (playerFromProxy?.uuid) {
      return playerFromProxy.uuid;
    }

    if (this.mojangApi && typeof this.mojangApi.getUuid === "function") {
      return this.mojangApi.getUuid(playerName);
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.mojang.com",
        path: `/users/profiles/minecraft/${playerName}`,
        method: "GET",
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (response.id) {
              resolve(response.id);
            } else {
              resolve(null);
            }
          } catch (err) {
            resolve(null);
          }
        });
      });

      req.on("error", () => {
        resolve(null);
      });
      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error("Seraph UUID lookup timed out"));
      });

      req.end();
    });
  }

  async getTags(playerName) {
    const apiKey = this.api.config.get("api.seraph.key");
    if (!apiKey) {
      console.error("[Seraph API] No API key configured");
      return [];
    }

    try {
      const uuid = await this.getUuid(playerName);
      if (!uuid) {
        return [];
      }
      return await this.checkTags(uuid, apiKey);
    } catch (err) {
      console.error(`[Seraph API] Error fetching tags: ${err.message}`);
      return [];
    }
  }

  async checkTags(uuid, apiKey) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.seraph.si",
        path: `/${uuid}/blacklist`,
        method: "GET",
        headers: {
          "seraph-api-key": apiKey,
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const response = JSON.parse(data);
            if (response.code !== 0) {
              resolve([]);
              return;
            }

            const tags = [];
            const responseData = response.data;

            if (responseData.blacklist?.tagged) {
              const reportType = responseData.blacklist.report_type || "";
              let tagType;
              
              const rt = reportType.toLowerCase();
              if (rt.includes("closet")) {
                tagType = "closet_cheater";
              } else if (rt.includes("blatant")) {
                tagType = "blatant_cheater";
              } else if (rt.includes("legit")) {
                tagType = "legit_sniper";
              } else if (rt.includes("potential")) {
                tagType = "potential_sniper";
              } else if (rt.includes("sniping") || rt.includes("sniper")) {
                tagType = "sniping";
              } else if (rt.includes("alt")) {
                tagType = "alt_account";
              } else if (rt.includes("caution")) {
                tagType = "caution";
              } else {
                tagType = "blatant_cheater";
              }
              
              tags.push({
                type: tagType,
                reason: responseData.blacklist.tooltip,
              });
            }

            if (responseData.bot?.tagged) {
              tags.push({
                type: "bot",
                tooltip: responseData.bot.tooltip,
              });
            }

            if (responseData.annoylist?.tagged) {
              tags.push({
                type: "annoying",
                tooltip: responseData.annoylist.tooltip,
              });
            }

            if (responseData.member?.tagged) {
              tags.push({
                type: "alt_account",
                tooltip: responseData.member.tooltip,
              });
            }

            resolve(tags);
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });
      req.setTimeout(this.REQUEST_TIMEOUT_MS, () => {
        req.destroy(new Error("Seraph tag request timed out"));
      });

      req.end();
    });
  }

  getCachedTags(playerName) {
    const cached = this.cache?.getSeraphTags(playerName);
    return cached ?? null;
  }

  setCachedTags(playerName, tags) {
    this.cache?.setSeraphTags(playerName, tags);
  }

  getTagIcon(type) {
    const icons = {
      closet_cheater: "CC",
      blatant_cheater: "BC",
      sniping: "S",
      legit_sniper: "LS",
      potential_sniper: "PS",
      alt_account: "ALT",
      bot: "BOT",
      annoying: "AN",
      caution: "C",
    };
    return icons[type] || "?";
  }

  getTagColor(type) {
    return "b";
  }

  getSupportedTags() {
    return [
      "closet_cheater",
      "blatant_cheater",
      "sniping",
      "legit_sniper",
      "potential_sniper",
      "alt_account",
      "bot",
      "annoying",
      "caution",
    ];
  }

  mapToClientTag(providerTagType) {
    const mapping = {
      closet_cheater: "CLOSET_CHEATER",
      blatant_cheater: "BLATANT_CHEATER",
      sniping: "SNIPER",
      legit_sniper: "LEGIT_SNIPER",
      potential_sniper: "POTENTIAL_SNIPER",
      alt_account: "ALT_ACCOUNT",
      bot: "BOT",
      annoying: "ANNOYING",
      caution: "CAUTION",
    };
    return mapping[providerTagType] || null;
  }
}

module.exports = SeraphApi;
