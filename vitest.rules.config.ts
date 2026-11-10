import { defineConfig } from "vitest/config";

/**
 * Firestore security-rules tests. They need the Firestore emulator, so they are
 * not part of `npm test`; run them with `npm run test:rules`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
