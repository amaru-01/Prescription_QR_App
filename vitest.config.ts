import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/lib/**", "src/app/api/**"],
      exclude: ["**/*.test.ts"],
    },
  },
});
