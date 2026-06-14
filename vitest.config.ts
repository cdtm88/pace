import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: {
      UPSTASH_REDIS_REST_URL: "https://test.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "test-token",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
