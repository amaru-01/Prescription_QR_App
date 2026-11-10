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
      // Measured at 67% / 67% / 63% / 67% (statements / branches / functions / lines).
      // Set a couple of points below so only a real regression fails the build.
      // Raise these as coverage improves; never lower them to make a change pass.
      thresholds: { statements: 65, branches: 65, functions: 60, lines: 65 },
    },
  },
});
