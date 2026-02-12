const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/build/**",
      "Reports/**",
      "QUARANTINE/**",
      "Artifacts/**",
      "vendor/**",
      "apps/web/public/**",
      "eslint.config.js",
      "tools/**",
      "public/geo/**/*.geo.json"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-undef": "off"
    }
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.name='console'][callee.property.name='log']",
          message:
            "console.log запрещён; используй console.warn/error и префиксы MAP_/UI_/SSOT_/PASS_/CI_"
        }
      ]
    }
  }
];
