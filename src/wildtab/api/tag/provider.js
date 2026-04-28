class TagProvider {
  constructor(api, cache) {
    this.api = api;
    this.cache = cache;
    this.providerName = "Unknown";
    this.providerColor = "§f";
  }

  async getTags(playerName) {
    throw new Error(`getTags must be implemented by subclass (playerName=${String(playerName || "")})`);
  }

  mapToClientTag(providerTagType) {
    throw new Error(`mapToClientTag must be implemented by subclass (providerTagType=${String(providerTagType || "")})`);
  }

  getSupportedTags() {
    throw new Error("getSupportedTags must be implemented by subclass");
  }

  getProviderColor() {
    return this.providerColor;
  }

  getProviderName() {
    return this.providerName;
  }

  async getTagsWithCache(playerName) {
    const cached = this.getCachedTags(playerName);
    if (cached !== null && cached !== undefined) return cached;

    const tags = await this.getTags(playerName);
    if (Array.isArray(tags)) {
      const mappedTags = tags.map((tag) => ({
        ...tag,
        clientTag: this.mapToClientTag(tag.type),
      }));
      this.setCachedTags(playerName, mappedTags);
      return mappedTags;
    }
    return [];
  }

  getCachedTags() {
    return null;
  }

  setCachedTags(playerName, tags) {
    // Optional override in subclasses.
    if (this.api?.config?.get("debug")) {
      this.api.debugLog?.(`[TagProvider] setCachedTags not implemented for ${this.getProviderName?.() || "Unknown"} (playerName=${String(playerName || "")}, tags=${Array.isArray(tags) ? tags.length : 0})`);
    }
  }
}

module.exports = TagProvider;
