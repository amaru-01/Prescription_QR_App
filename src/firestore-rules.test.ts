import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Cheap guard that runs with every `npm test` (no emulator needed): the app only
 * touches Firestore from the server through the Admin SDK, which ignores these
 * rules, so the rules file must stay a blanket denial. The emulator tests in
 * tests/rules (`npm run test:rules`) check the same thing by actually trying to
 * read and write as different users.
 */
const rules = readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8");
const withoutComments = rules
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("firestore.rules", () => {
  it("contains no allow statement other than the blanket denial", () => {
    expect(withoutComments.match(/allow [^;]+;/g) ?? []).toEqual(["allow read, write: if false;"]);
  });

  it("applies the denial to every document", () => {
    expect(withoutComments).toMatch(/match \/\{document=\*\*\}/);
  });

  it("never grants access based on the signed-in user or request data", () => {
    expect(withoutComments).not.toMatch(/request\.auth|resource\.data|request\.resource/);
  });
});
