import path from "path";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Ignore files not tracked by VCS and any config files
  includeIgnoreFile(path.join(import.meta.dirname, ".gitignore")),
  { ignores: ["**/*.config.*"] },
  {
    files: ["**/*.js", "**/*.ts", "**/*.tsx"],
    plugins: {
      import: importPlugin,
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-misused-promises": [
        2,
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-unnecessary-condition": [
        "error",
        {
          allowConstantLoopConditions: true,
        },
      ],
      // Enforce arrow functions over function declarations
      "func-style": ["error", "expression"],
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-non-null-assertion": "error", // Disallow non-null assertions
      "@typescript-eslint/consistent-type-exports": "error", // Ensure consistent usage of type exports
      "@typescript-eslint/consistent-type-definitions": ["error", "type"], // Use 'type' over 'interface'
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "smart"],
      curly: ["error", "all"],
      "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: true },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
