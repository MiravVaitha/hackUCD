import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts"],
    // Database tests share one local Postgres, so run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ["tests/setup-env.ts"],
  },
});
