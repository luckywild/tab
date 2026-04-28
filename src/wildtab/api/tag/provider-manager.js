const {
  TAG_DEFINITIONS,
  getHighestPriorityTag: getCentralizedHighestPriorityTag,
} = require("./tags");

class TagProviderManager {
  constructor(api, cache) {
    this.api = api;
    this.cache = cache;
    this.providers = new Map();
  }

  registerProvider(provider) {
    this.providers.set(provider.getProviderName(), provider);
  }

  getProvider(name) {
    return this.providers.get(name);
  }

  isProviderEnabled(name) {
    return this.api.config.get(`api.${name}.enabled`) === true;
  }

  async getTagsForPlayer(playerName) {
    const providerPromises = [];

    for (const [name, provider] of this.providers.entries()) {
      if (!this.isProviderEnabled(name)) continue;

      providerPromises.push(
        (async () => {
          try {
            const tags = await provider.getTagsWithCache(playerName);
            if (tags && tags.length > 0) {
              return tags.map((tag) => {
                const clientTagDef = TAG_DEFINITIONS[tag.clientTag];
                return {
                  ...tag,
                  provider: name,
                  providerColor: provider.getProviderColor(),
                  icon: clientTagDef?.icon || "?",
                  color: clientTagDef?.color || "§f",
                  priority: clientTagDef?.priority || 999,
                };
              });
            }
          } catch (err) {
            this.api.debugLog(
              `[TagProviderManager] Error getting tags from ${name}: ${err.message}`,
            );
          }
          return [];
        })(),
      );
    }

    const results = await Promise.all(providerPromises);
    return results.flat();
  }

  formatTagsForDisplay(tags) {
    if (!tags || tags.length === 0) return "";

    const priorityTag = getCentralizedHighestPriorityTag(tags);
    if (!priorityTag) return "";

    const color = priorityTag.color || "§c";
    const icon = priorityTag.icon || "?";

    return `${color}[${icon}]`;
  }

  getHighestPriorityTag(tags) {
    return getCentralizedHighestPriorityTag(tags);
  }
}

module.exports = TagProviderManager;
