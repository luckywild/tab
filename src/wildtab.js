const Wildtab = require("./wildtab/index");
const configSchema = require("./wildtab/config");

module.exports = (api) => {
  api.metadata({
    name: "wildtab",
    displayName: "wildtab",
    prefix: "§dwt",
    version: "1.0.0",
    author: "wild",
    minVersion: "0.1.7",
    description: "best bedwars tab",
    dependencies: [
      { name: "denicker", minVersion: "1.1.0" },
    ],
  });

  api.initializeConfig(configSchema);
  api.configSchema(configSchema);

  const wildtab = new Wildtab(api);

  api.commands((registry) => {
    registry
      .command("tags")
      .description("Check tags for a player")
      .argument("<player>", { description: "Player to check" })
      .handler((ctx) => wildtab.commandHandler.handleTagsCommand(ctx));
    registry
      .command("testapis")
      .description("Test all API connections")
      .handler((ctx) => wildtab.commandHandler.handleTestApisCommand(ctx));
    registry
      .command("testmessages")
      .description("Print sample output for all local wildtab message styles")
      .handler((ctx) => wildtab.commandHandler.handleTestMessagesCommand(ctx));
  });

  wildtab.registerHandlers();
  return wildtab;
};
