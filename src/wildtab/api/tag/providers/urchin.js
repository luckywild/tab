const https = require("https");
const TagProvider = require("../provider");

class UrchinApi extends TagProvider {
  constructor(api, cache) {
    super(api, cache);
    this.providerName = "urchin";
    this.providerColor = "§d";
    this.REQUEST_TIMEOUT_MS = 4000;
  }

  async getTags(playerName) {
    try {
      const response = await this.checkTags([playerName]);
      return response.players?.[playerName] || [];
    } catch (err) {
      console.error(`[Urchin API] Error fetching tags: ${err.message}`);
      return [];
    }
  }

  async checkTags(usernames) {
    if (!usernames || usernames.length === 0) return {};

    const sources = "MANUAL";

    return new Promise((resolve, reject) => {
      const requestBody = { usernames: usernames };
      const jsonBody = JSON.stringify(requestBody);

      const path = `/player?sources=${sources}`;

      const options = {
        hostname: "urchin.ws",
        path: path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(jsonBody),
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
            if (response === "Invalid Key") {
              throw new Error("Invalid API Key");
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

      req.write(jsonBody);
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
