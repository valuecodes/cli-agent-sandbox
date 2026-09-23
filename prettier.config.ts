import type { Config } from "prettier";

const config: Config = {
  trailingComma: "es5",
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  // Third-party imports, a blank line, then relative imports. The `~tools/`,
  // `~clients/` and `~utils/` aliases sort with third-party modules; add a
  // group here (e.g. `^~(tools|clients|utils)/`) to split them out.
  importOrder: ["<THIRD_PARTY_MODULES>", "", "^[./]"],
};

export default config;
