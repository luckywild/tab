const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // Keep signal, but don't block merges on these.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
