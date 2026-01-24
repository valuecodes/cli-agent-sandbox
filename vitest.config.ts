import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "~tools": path.resolve(__dirname, "./src/tools"),
      "~clients": path.resolve(__dirname, "./src/clients"),
      "~utils": path.resolve(__dirname, "./src/utils"),
    },
  },
});
