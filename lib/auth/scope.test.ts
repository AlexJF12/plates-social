import { describe, expect, it } from "vitest";
import { COLLECTIONS, SCOPE } from "../config";
import { hasVisitScope } from "./scope";

describe("hasVisitScope", () => {
  it("is in SCOPE", () => {
    expect(hasVisitScope(SCOPE)).toBe(true);
  });

  it("is false for a session from before visits", () => {
    const old = SCOPE.split(" ").filter((s) => !s.includes(".visit")).join(" ");
    expect(hasVisitScope(old)).toBe(false);
    expect(hasVisitScope(undefined)).toBe(false);
  });

  it("doesn't match a narrower or a lookalike scope", () => {
    expect(hasVisitScope(`atproto repo:${COLLECTIONS.visit}?action=create`)).toBe(false);
    expect(hasVisitScope(`atproto repo:${COLLECTIONS.visit}x`)).toBe(false);
  });
});
