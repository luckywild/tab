class MojangApi {
  constructor(api, cache) {
    this.api = api;
    this.cache = cache || api.cache || null;
    this.UUID_FETCH_RETRY_DELAYS_MS = [300, 700, 1500];
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  shouldRetryStatus(status) {
    return status === 429 || status >= 500;
  }

  normalizeUuid(uuid) {
    if (typeof uuid !== "string") return null;
    const compact = uuid.replace(/-/g, "");
    if (!/^[0-9a-fA-F]{32}$/.test(compact)) return null;
    return compact.replace(
      /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
      "$1-$2-$3-$4-$5",
    );
  }

  async fetchUuidFromEndpoint(url) {
    const response = await fetch(url);
    if (response.status === 204 || response.status === 404) {
      return { kind: "not_found" };
    }

    if (!response.ok) {
      return {
        kind: this.shouldRetryStatus(response.status) ? "retryable_error" : "error",
        status: response.status,
      };
    }

    const data = await response.json();
    const uuid = this.normalizeUuid(data?.id);
    if (uuid) {
      return { kind: "ok", uuid };
    }
    return { kind: "not_found" };
  }

  async getUuid(playerName) {
    const playerFromProxy = this.api.getPlayerByName(playerName);
    if (playerFromProxy?.uuid) {
      return playerFromProxy.uuid;
    }

    const cached = this.cache?.getUuid(playerName);
    if (cached) return cached;

    const encodedPlayerName = encodeURIComponent(playerName);
    const endpoints = [
      `https://stash.seraph.si/mojang/${encodedPlayerName}`,
      `https://api.mojang.com/users/profiles/minecraft/${encodedPlayerName}`,
    ];
    const officialMojangEndpoint =
      `https://api.mojang.com/users/profiles/minecraft/${encodedPlayerName}`;

    let sawRetryableError = false;

    for (let attempt = 0; attempt <= this.UUID_FETCH_RETRY_DELAYS_MS.length; attempt++) {
      let debugLoggedThisAttempt = false;
      let anyRetryableThisAttempt = false;
      let anyNonRetryableErrorThisAttempt = false;
      let sawOfficialNotFoundThisAttempt = false;

      for (const endpoint of endpoints) {
        try {
          const result = await this.fetchUuidFromEndpoint(endpoint);

          if (result.kind === "ok") {
            this.cache?.setUuid(playerName, result.uuid);
            return result.uuid;
          }

          if (result.kind === "not_found") {
            if (endpoint === officialMojangEndpoint) {
              sawOfficialNotFoundThisAttempt = true;
            }
            continue;
          }

          if (result.kind === "retryable_error") {
            sawRetryableError = true;
            anyRetryableThisAttempt = true;
            continue;
          }

          if (result.kind === "error") {
            anyNonRetryableErrorThisAttempt = true;
          }
        } catch (error) {
          sawRetryableError = true;
          anyRetryableThisAttempt = true;
          if (!debugLoggedThisAttempt && this.api?.config?.get("debug")) {
            debugLoggedThisAttempt = true;
            this.api.debugLog?.(`[Mojang API] UUID fetch failed for ${playerName} via ${endpoint}: ${error.message}`);
          }
        }
      }

      // Official Mojang not_found is authoritative for username lookup.
      // Do not keep retrying only because stash returned a non-retryable error (e.g., 400).
      if (sawOfficialNotFoundThisAttempt) {
        return null;
      }

      if (!anyRetryableThisAttempt && !anyNonRetryableErrorThisAttempt) {
        return null;
      }

      if (!anyRetryableThisAttempt && anyNonRetryableErrorThisAttempt) {
        return null;
      }

      if (anyRetryableThisAttempt && attempt < this.UUID_FETCH_RETRY_DELAYS_MS.length) {
        await this.sleep(this.UUID_FETCH_RETRY_DELAYS_MS[attempt]);
      }
    }

    if (sawRetryableError) {
      throw new Error(`Temporary UUID lookup failure for ${playerName}`);
    }

    return null;
  }
}

module.exports = MojangApi;
