const { TAG_DEFINITIONS } = require("../api/tag/tags");
const messages = require("../messages");

function renderTagAlert(playerName, tags, wrapText) {
  if (!Array.isArray(tags) || tags.length === 0) return [];

  const firstTag = tags[0];
  const clientTagDef = TAG_DEFINITIONS[firstTag.clientTag];
  const displayTagType = clientTagDef
    ? clientTagDef.icon
    : String(firstTag.clientTag || "?").replace(/_/g, " ");

  const providersList = [...new Set(tags.map((t) => t.provider))];
  const coloredProviders = messages.utility.coloredProviders(providersList);
  const mainLine = messages.tags.mainLine(
    playerName,
    displayTagType,
    coloredProviders,
  );

  if (tags.length === 1) {
    const providerType = String(firstTag.type || firstTag.clientTag || "?").replace(
      /_/g,
      " ",
    );
    const reason = firstTag.reason || messages.tags.noContext;
    const wrappedReason = wrapText(reason, 40);
    const hoverLines = [
      { text: messages.tags.hoverTitle(playerName) },
      { text: `${messages.tags.hoverSeparator}\n` },
      { text: messages.tags.hoverItem(providerType, coloredProviders) },
      ...wrappedReason.map((line) => ({ text: messages.tags.hoverReason(line) })),
      { text: `\n${messages.tags.hoverSeparator}` },
    ];

    const singleMessage = {
      text: "",
      extra: [
        {
          text: mainLine,
          hoverEvent: {
            action: "show_text",
            value: { text: "", extra: hoverLines },
          },
          clickEvent: {
            action: "suggest_command",
            value: messages.tags.clickSuggest(playerName, displayTagType),
          },
        },
      ],
    };

    const output = [singleMessage];
    if (firstTag.reason) {
      output.push(messages.tags.reasonInline(firstTag.reason));
    }
    return output;
  }

  const multiHeader = {
    text: "",
    extra: [
      {
        text: mainLine,
        clickEvent: {
          action: "suggest_command",
          value: messages.tags.clickSuggest(playerName, displayTagType),
        },
      },
    ],
  };

  const detailLines = tags.map((tag) => {
    const provider = typeof tag.provider === "string" ? tag.provider : "unknown";
    const pName = provider.charAt(0).toUpperCase() + provider.slice(1);
    const pColor = messages.utility.providerColor(provider);
    const providerType = (tag.type || tag.clientTag || "?").replace(/_/g, " ");
    const reason = messages.tags.singleLineReason(tag.reason, messages.tags.noContext);
    return messages.tags.immediateItem(providerType, `${pColor}${pName}`, reason);
  });

  return [multiHeader, ...detailLines];
}

module.exports = {
  renderTagAlert,
};
