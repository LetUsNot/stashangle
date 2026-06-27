import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom"
  },
  define: {
    __STASHANGLE_BUILD_ID__: JSON.stringify("0.1.11")
  }
});
