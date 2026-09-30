import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  datetimeLocalInputToCookedAt,
  localDateOf,
  toDatetimeLocalInput,
  toLocalDatetimeWithOffset,
} from "./datetime";

// process.env.TZ changes the zone Date uses for local time in Node.
const withTZ = (tz: string) => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.TZ;
    process.env.TZ = tz;
  });
  afterEach(() => {
    process.env.TZ = prev;
    vi.useRealTimers();
  });
};

describe("in America/New_York", () => {
  withTZ("America/New_York");

  it("writes local time with the DST offset", () => {
    expect(toLocalDatetimeWithOffset(new Date("2026-09-29T23:30:00Z"))).toBe(
      "2026-09-29T19:30:00-04:00",
    );
  });

  it("uses the offset of the cooked date, not of now", () => {
    // January is EST (-05:00) even if "now" is in EDT.
    expect(datetimeLocalInputToCookedAt("2026-01-15T19:30")).toBe(
      "2026-01-15T19:30:00-05:00",
    );
  });

  it("keeps the local date when the evening crosses midnight UTC", () => {
    const cookedAt = datetimeLocalInputToCookedAt("2026-09-29T21:00")!;
    expect(new Date(cookedAt).toISOString()).toBe("2026-09-30T01:00:00.000Z");
    expect(localDateOf(cookedAt)).toBe("2026-09-29");
  });

  it("round-trips through the datetime-local input", () => {
    const d = new Date("2026-09-29T23:30:45Z");
    expect(toDatetimeLocalInput(d)).toBe("2026-09-29T19:30");
  });
});

describe("in Asia/Kolkata (+05:30)", () => {
  withTZ("Asia/Kolkata");

  it("writes half-hour offsets", () => {
    expect(datetimeLocalInputToCookedAt("2026-09-30T01:00")).toBe(
      "2026-09-30T01:00:00+05:30",
    );
    // 2026-09-29T19:30Z: the previous day in UTC, but the 30th locally.
    expect(localDateOf("2026-09-30T01:00:00+05:30")).toBe("2026-09-30");
  });
});

describe("in UTC", () => {
  withTZ("UTC");

  it("writes +00:00", () => {
    expect(toLocalDatetimeWithOffset(new Date("2026-09-29T12:00:00Z"))).toBe(
      "2026-09-29T12:00:00+00:00",
    );
  });
});

describe("datetimeLocalInputToCookedAt", () => {
  it.each(["", "yesterday", "2026-09-29", "2026-13-45T99:99"])(
    "rejects %j",
    (v) => expect(datetimeLocalInputToCookedAt(v)).toBeNull(),
  );
});

describe("localDateOf", () => {
  it("uses the date part of a Z datetime", () => {
    expect(localDateOf("2026-09-29T23:30:00.000Z")).toBe("2026-09-29");
  });
});
