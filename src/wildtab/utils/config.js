function parseStringList(value) {
  if (Array.isArray(value)) {
    return value
      .map((name) => String(name || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return [];
}

function parseLowercaseSet(value) {
  return new Set(
    parseStringList(value).map((name) => name.toLowerCase()),
  );
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  parseStringList,
  parseLowercaseSet,
  escapeRegex,
};
