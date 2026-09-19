import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "playwright-report/",
      "test-results/",
      ".wrangler/",
      "worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["scripts/**/*.{mjs,ts}", "playwright.config.ts", "tests/e2e/**/*.ts"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: {
      globals: {
        URL: "readonly",
        caches: "readonly",
        fetch: "readonly",
        self: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
);
