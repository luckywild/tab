const TAG_DEFINITIONS = {
  BLATANT_CHEATER: { icon: "BC", color: "§c", priority: 1 },
  CLOSET_CHEATER: { icon: "CC", color: "§c", priority: 2 },
  SNIPER: { icon: "S", color: "§c", priority: 3 },
  LEGIT_SNIPER: { icon: "LS", color: "§c", priority: 4 },
  POTENTIAL_SNIPER: { icon: "PS", color: "§c", priority: 5 },
  CAUTION: { icon: "C", color: "§c", priority: 6 },
  ALT_ACCOUNT: { icon: "ALT", color: "§7", priority: 10 },
  BOT: { icon: "BOT", color: "§7", priority: 11 },
  ANNOYING: { icon: "AN", color: "§7", priority: 12 },
};

const TAG_PRIORITY = Object.entries(TAG_DEFINITIONS)
  .sort((a, b) => a[1].priority - b[1].priority)
  .map(([key]) => key);

function getClientTag(tagType) {
  return TAG_DEFINITIONS[tagType] || null;
}

function getHighestPriorityTag(tags) {
  if (!tags || tags.length === 0) return null;
  
  for (const tagKey of TAG_PRIORITY) {
    const found = tags.find((t) => t.clientTag === tagKey);
    if (found) return found;
  }
  
  return tags[0];
}

module.exports = {
  TAG_DEFINITIONS,
  TAG_PRIORITY,
  getClientTag,
  getHighestPriorityTag,
};
