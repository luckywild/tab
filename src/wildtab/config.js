module.exports = [
  {
    label: "API Keys",
    description: "Configure API keys",
    defaults: {
      api: {
        testOnLobbyJoin: false,
        hubOnApiFailure: false,
        hypixel: {
          key: "",
          ttl: 300,
        },
        urchin: {
          enabled: true,
          ttl: 1800,
        },
        seraph: {
          enabled: false,
          key: "",
          ttl: 1800,
        },
        bordic: {
          enabled: false,
          key: "",
          ttl: 1800,
        },
      },
    },
    settings: [
      {
        key: "api.testOnLobbyJoin",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Test APIs on lobby join",
      },
      {
        key: "api.hubOnApiFailure",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "/hub if APIs fail",
      },
      {
        key: "api.hypixel.key",
        type: "text",
        description: "Hypixel API key. Get one at https://developer.hypixel.net/",
      },
      {
        key: "api.hypixel.ttl",
        type: "text",
        description: "Cache duration in seconds (recommended: 300)",
      },
      {
        key: "api.urchin.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Enable Urchin tag provider",
      },
      {
        key: "api.urchin.ttl",
        type: "text",
        description: "Cache duration in seconds (recommended: 1800)",
      },
      {
        key: "api.seraph.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Enable Seraph tag provider",
      },
      {
        key: "api.seraph.key",
        type: "text",
        description: "Seraph API key. Get one from api.seraph.si",
      },
      {
        key: "api.seraph.ttl",
        type: "text",
        description: "Cache duration in seconds (recommended: 1800)",
      },
      {
        key: "api.bordic.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Enable Bordic resources (estimated winstreak and ping)",
      },
      {
        key: "api.bordic.key",
        type: "text",
        description: "Bordic API key. Get one from bordic.xyz",
      },
      {
        key: "api.bordic.ttl",
        type: "text",
        description: "Cache duration in seconds (recommended: 1800)",
      },
    ],
  },
  {
    label: "Nicknames",
    description: "Optional nick aliases and ignore list",
    defaults: {
      nicks: {
        me: "",
        ignore: "",
      },
    },
    settings: [
      {
        key: "nicks.me",
        type: "text",
        description: "Optional self nick aliases, comma-separated usernames, or an array in config JSON",
      },
      {
        key: "nicks.ignore",
        type: "text",
        description: "Comma-separated usernames to ignore for pregame autododge and automatic tag alerts",
      },
    ],
  },
  {
    label: "Tab Display - Stars",
    description: "Show player stars in tab",
    defaults: {
      tab: {
        showStars: true,
      },
    },
    settings: [
      {
        key: "tab.showStars",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show stars in tab",
      },
    ],
  },
  {
    label: "Tab Display - FKDR",
    description: "Show FKDR in tab",
    defaults: {
      tab: {
        showFkdr: true,
      },
    },
    settings: [
      {
        key: "tab.showFkdr",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show FKDR in tab",
      },
    ],
  },
  {
    label: "Tab Display - Win/Loss",
    description: "Show win/loss ratio in tab",
    defaults: {
      tab: {
        showWl: false,
      },
    },
    settings: [
      {
        key: "tab.showWl",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show win/loss ratio in tab",
      },
    ],
  },
  {
    label: "Tab Display - Finals",
    description: "Show final kills/deaths in tab",
    defaults: {
      tab: {
        showFinals: false,
      },
    },
    settings: [
      {
        key: "tab.showFinals",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show final kills/deaths in tab",
      },
    ],
  },
  {
    label: "Tab Display - Wins",
    description: "Show total wins in tab",
    defaults: {
      tab: {
        showWins: false,
      },
    },
    settings: [
      {
        key: "tab.showWins",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show total wins in tab",
      },
    ],
  },
  {
    label: "Tab Display - Winstreak",
    description: "Show winstreak in tab",
    defaults: {
      tab: {
        showWs: true,
      },
    },
    settings: [
      {
        key: "tab.showWs",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show winstreak in tab",
      },
    ],
  },
  {
    label: "Tab Display - Ping",
    description: "Show Bordic average ping in tab",
    defaults: {
      tab: {
        showPing: true,
        colorPing: true,
      },
    },
    settings: [
      {
        key: "tab.showPing",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show average ping in tab",
      },
      {
        key: "tab.colorPing",
        type: "toggle",
        text: ["GRAY", "COLOR"],
        description: "Color ping by latency instead of plain gray",
      },
    ],
  },
  {
    label: "Tab Display - Tags",
    description: "Show tag provider tags in tab",
    defaults: {
      tab: {
        showTags: true,
      },
    },
    settings: [
      {
        key: "tab.showTags",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show tag provider tags in tab",
      },
    ],
  },
  {
    label: "Tab Display - Gray Team",
    description: "Gray out your team's prefix to not attract attention",
    defaults: {
      tab: {
        grayOwnTeam: false,
      },
    },
    settings: [
      {
        key: "tab.grayOwnTeam",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Gray out your team's prefix in tab",
      },
    ],
  },
  {
    label: "Tab Display - Nick Labels",
    description: "Show nick labels in tab for denicked players",
    defaults: {
      tab: {
        showNicks: true,
      },
    },
    settings: [
      {
        key: "tab.showNicks",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show nick labels for denicked players",
      },
    ],
  },
  {
    label: "Auto /who",
    description: "Automatically run /who at game start",
    defaults: {
      autoWho: {
        enabled: true,
        delay: 0,
        hideOutput: true,
      },
    },
    settings: [
      {
        key: "autoWho.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Automatically execute /who when Bedwars starts",
      },
      {
        key: "autoWho.delay",
        type: "cycle",
        description: "Delay before executing /who",
        values: [
          { text: "0ms", value: 0 },
          { text: "500ms", value: 500 },
          { text: "1000ms", value: 1000 },
        ],
      },
      {
        key: "autoWho.hideOutput",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Hide auto /who command and ONLINE response from chat",
      },
    ],
  },
  {
    label: "Alerts",
    description: "Control automatic pregame and game-start chat alerts",
    defaults: {
      alerts: {
        lobbyChatStats: true,
        gameStartTags: true,
      },
    },
    settings: [
      {
        key: "alerts.lobbyChatStats",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show stats when players chat in lobby",
      },
      {
        key: "alerts.gameStartTags",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Show tag alerts when game starts",
      },
    ],
  },
  {
    label: "Rush Assessment",
    description: "Announce side/corner lane strength in party chat after /who resolves",
    defaults: {
      rush: {
        enabled: true,
        first: true,
        partyChatWhenInParty: true,
        targetSoloDuo: 3,
        targetTrioQuad: 1,
      },
    },
    settings: [
      {
        key: "rush.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Enable rush assessment messages",
      },
      {
        key: "rush.first",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Send first rush assessment line",
      },
      {
        key: "rush.partyChatWhenInParty",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Send rush messages to party chat when in a party",
      },
      {
        key: "rush.targetSoloDuo",
        type: "cycle",
        description: "How many strongest enemy teams to include in target callout for solos/duos (0 disables target callout)",
        values: [
          { text: "0", value: 0 },
          { text: "1", value: 1 },
          { text: "2", value: 2 },
          { text: "3", value: 3 },
          { text: "4", value: 4 },
        ],
      },
      {
        key: "rush.targetTrioQuad",
        type: "cycle",
        description: "How many strongest enemy teams to include in target callout for trios/quads (0 disables target callout)",
        values: [
          { text: "0", value: 0 },
          { text: "1", value: 1 },
          { text: "2", value: 2 },
          { text: "3", value: 3 },
        ],
      },
    ],
  },
  {
    label: "Autododge",
    description: "Automatically dodge games based on player stats when they talk in lobby",
    defaults: {
      autododge: {
        enabled: false,
        requeue: false,
        minFkdr: "",
        minWins: "",
        minStars: "",
        minWs: "",
        minFinals: "",
        dodgeNicks: false,
        dodgeTags: false,
        dodgeMaps: {
          enabled: false,
          list: "",
        },
      },
    },
    settings: [
      {
        key: "autododge.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Enable autododge",
      },
      {
        key: "autododge.requeue",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Try /requeue before /hub when countdown has enough time",
      },
      {
        key: "autododge.minFkdr",
        type: "text",
        description: "Dodge when FKDR is above this value (leave empty to disable)",
      },
      {
        key: "autododge.minWins",
        type: "text",
        description: "Dodge when wins are above this value (leave empty to disable)",
      },
      {
        key: "autododge.minStars",
        type: "text",
        description: "Dodge when stars are above this value (leave empty to disable)",
      },
      {
        key: "autododge.minWs",
        type: "text",
        description: "Dodge when winstreak is above this value (leave empty to disable)",
      },
      {
        key: "autododge.minFinals",
        type: "text",
        description: "Dodge when final kills are above this value (leave empty to disable)",
      },
      {
        key: "autododge.dodgeNicks",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Dodge nicked players",
      },
      {
        key: "autododge.dodgeTags",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Dodge players with any tag",
      },
      {
        key: "autododge.dodgeMaps.enabled",
        type: "toggle",
        text: ["OFF", "ON"],
        description: "Dodge specific maps when joining/requeueing a lobby",
      },
      {
        key: "autododge.dodgeMaps.list",
        type: "text",
        description: "Comma-separated maps to dodge, or an array in config JSON (e.g. nebuc,airshow)",
      },
    ],
  },
];
