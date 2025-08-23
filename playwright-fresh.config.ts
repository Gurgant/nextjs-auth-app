import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test-temp",
  use: {
    baseURL: "http://localhost:3000",
  },
});
