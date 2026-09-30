import { describe, expect, it } from "vitest";
import { addMonths, badgeLabel, formatMonth, isCompletedMonth, isMonth, latestCompletedMonth, latestStartedMonth } from "./best";

describe("months", () => {
  it("validates and steps across years", () => {
    expect([isMonth("2026-09"), isMonth("2026-13"), isMonth("2026-9"), isMonth("x")]).toEqual([true, false, false, false]);
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("formats", () => {
    expect(formatMonth("2026-09")).toBe("September 2026");
    expect(badgeLabel({ mealType: "dinner", month: "2026-09" })).toBe("Best dinner, Sep 2026");
  });
});

describe("completed months (ended at UTC−12)", () => {
  it("September ends everywhere at 12:00 UTC on October 1", () => {
    expect(latestCompletedMonth(new Date("2026-10-01T11:59:59Z"))).toBe("2026-08");
    expect(latestCompletedMonth(new Date("2026-10-01T12:00:00Z"))).toBe("2026-09");
    expect(isCompletedMonth("2026-09", new Date("2026-10-01T11:59:59Z"))).toBe(false);
    expect(isCompletedMonth("2026-09", new Date("2026-10-01T12:00:00Z"))).toBe(true);
  });

  it("October starts somewhere (UTC+14) at 10:00 UTC on September 30", () => {
    expect(latestStartedMonth(new Date("2026-09-30T09:59:59Z"))).toBe("2026-09");
    expect(latestStartedMonth(new Date("2026-09-30T10:00:00Z"))).toBe("2026-10");
  });
});
