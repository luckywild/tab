class GameHandler {
  constructor(api, wildtabInstance) {
    this.api = api;
    this.wildtabInstance = wildtabInstance;
    this.gameStarted = false;
    this.hasJoinedGame = false;
    this.lastCountdownSeconds = null;
    this.lastCountdownAt = null;
    this.lastCleanMessage = null;
    this.pendingAutoWhoTimer = null;
  }

  isPlayerJoinMessage(message) {
    return /^\w+ has joined \(\d+\/\d+\)!$/.test(message.trim());
  }

  isBedwarsStartMessage(currentCleanMessage, lastCleanMessage) {
    const originalStartText = "Protect your bed and destroy the enemy beds.";
    if (currentCleanMessage.trim() === originalStartText) {
      return true;
    }

    const divider =
      "▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬";
    const titleText = "Bed Wars";

    if (
      lastCleanMessage &&
      lastCleanMessage.trim() === divider &&
      currentCleanMessage.trim() === titleText
    ) {
      return true;
    }

    return false;
  }

  getCountdownSeconds(message) {
    const match = message
      .trim()
      .match(/^The game starts in (\d+) second(?:s)?!$/);
    if (!match) return null;

    const seconds = parseInt(match[1], 10);
    return Number.isFinite(seconds) ? seconds : null;
  }

  isTooLateToDodge() {
    if (this.gameStarted) return true;
    if (this.lastCountdownSeconds === null) return false;
    return this.lastCountdownSeconds <= 2;
  }

  getEstimatedGameStartTime() {
    if (this.gameStarted) return Date.now();
    if (this.lastCountdownSeconds === null || this.lastCountdownAt === null) {
      return null;
    }

    return this.lastCountdownAt + this.lastCountdownSeconds * 1000;
  }

  async handleGameStart(currentCleanMessage, lastCleanMessage) {
    if (!this.hasJoinedGame && this.isPlayerJoinMessage(currentCleanMessage)) {
      this.hasJoinedGame = true;
    }

    const countdownSeconds = this.getCountdownSeconds(currentCleanMessage);
    if (countdownSeconds !== null) {
      this.lastCountdownSeconds = countdownSeconds;
      this.lastCountdownAt = Date.now();
    }

    if (this.isBedwarsStartMessage(currentCleanMessage, lastCleanMessage)) {
      if (this.gameStarted) return;

      this.gameStarted = true;
      this.lastCountdownSeconds = 0;
      this.lastCountdownAt = Date.now();

      if (!this.api.config.get("autoWho.enabled")) return;

      const delay = this.api.config.get("autoWho.delay") || 0;

      if (this.pendingAutoWhoTimer) {
        clearTimeout(this.pendingAutoWhoTimer);
      }
      this.pendingAutoWhoTimer = setTimeout(() => {
        this.pendingAutoWhoTimer = null;
        if (!this.gameStarted) return;
        this.wildtabInstance.chatHandler.requestAutoWho();
      }, delay);
    }
  }

  resetGameState() {
    if (this.pendingAutoWhoTimer) {
      clearTimeout(this.pendingAutoWhoTimer);
      this.pendingAutoWhoTimer = null;
    }
    this.gameStarted = false;
    this.hasJoinedGame = false;
    this.lastCountdownSeconds = null;
    this.lastCountdownAt = null;
    this.lastCleanMessage = null;
  }
}

module.exports = GameHandler;
