import { describe, expect, it } from "vitest";
import { localDateOf } from "./datetime";
import { addDays, countStats, monthStart, statsWindow, todayIn, weekStart } from "./stats";

// Reference dates: 2026-09-28 is a Monday, 2026-09-27 a Sunday.

describe("weekStart", () => {
  it("is the Monday on or before the date", () => {
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // Mon
    expect(weekStart("2026-10-01")).toBe("2026-09-28"); // Thu, across a month
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sun ends the week
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sun
    expect(weekStart("2027-01-03")).toBe("2026-12-28"); // across a year
  });
});

describe("todayIn", () => {
  // 02:30 UTC on Monday is still Sunday evening in New York.
  const now = new Date("2026-09-28T02:30:00Z");

  it("uses the viewer's zone, not UTC", () => {
    expect(todayIn("UTC", now)).toBe("2026-09-28");
    expect(todayIn("America/New_York", now)).toBe("2026-09-27");
    expect(todayIn("Asia/Tokyo", new Date("2026-09-27T20:00:00Z"))).toBe("2026-09-28");
  });
});

describe("countStats", () => {
  it("counts Monday to Sunday and the calendar month", () => {
    const days = [
      { date: "2026-09-20", count: 5 }, // Sun of the previous week
      { date: "2026-09-21", count: 1 }, // Mon
      { date: "2026-09-27", count: 2 }, // Sun
      { date: "2026-09-28", count: 4 }, // next Mon
      { date: "2026-08-31", count: 9 }, // previous month
    ];
    expect(countStats(days, "2026-09-24")).toEqual({ week: 3, month: 12 });
  });

  it("splits a week that spans two months", () => {
    const days = [
      { date: "2026-09-29", count: 1 },
      { date: "2026-10-01", count: 2 },
      { date: "2026-10-04", count: 3 },
    ];
    // Thu 1 Oct: the week is 28 Sep–4 Oct, the month is October only.
    expect(countStats(days, "2026-10-01")).toEqual({ week: 6, month: 5 });
  });

  it("is zero with no cooks", () => {
    expect(countStats([], "2026-10-01")).toEqual({ week: 0, month: 0 });
  });
});

describe("author offsets crossing midnight UTC", () => {
  // The day a cook counts on is its date in the author's own offset.
  const cooks = [
    "2026-09-27T22:30:00-04:00", // Sun evening in New York = Mon 02:30 UTC
    "2026-09-28T07:00:00+09:00", // Mon morning in Tokyo = Sun 22:00 UTC
    "2026-09-30T23:59:00+14:00", // last minute of Sep in Kiribati = Sep 30 09:59 UTC
    "2026-10-01T00:30:00-10:00", // first minutes of Oct in Hawaii = Oct 1 10:30 UTC
  ];
  const days = cooks.map((c) => ({ date: localDateOf(c), count: 1 }));

  it("buckets by the author's local date", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-28", "2026-09-30", "2026-10-01"]);
  });

  it("counts the New York Sunday cook in the previous week, the Tokyo Monday cook in this one", () => {
    // Viewer on Monday 28 Sep: this week is 28 Sep–4 Oct.
    expect(countStats(days, "2026-09-28")).toEqual({ week: 3, month: 3 });
    // Viewer still on Sunday 27 Sep: last week, and September.
    expect(countStats(days, "2026-09-27")).toEqual({ week: 1, month: 3 });
  });

  it("puts the Kiribati and Hawaii cooks in different months", () => {
    expect(countStats(days, "2026-10-02").month).toBe(1);
    expect(countStats(days, "2026-09-02").month).toBe(3);
  });

  it("gives viewers on either side of midnight UTC their own week", () => {
    const now = new Date("2026-09-28T02:30:00Z");
    expect(countStats(days, todayIn("America/New_York", now))).toEqual({ week: 1, month: 3 });
    expect(countStats(days, todayIn("Europe/Berlin", now))).toEqual({ week: 3, month: 3 });
  });
});

describe("statsWindow", () => {
  // The extreme zones: UTC-12 (Etc/GMT+12, sign inverted) and UTC+14.
  const zones = ["Etc/GMT+12", "Pacific/Honolulu", "America/New_York", "UTC", "Asia/Tokyo", "Pacific/Kiritimati"];
  const instants = [
    "2026-09-28T00:00:00Z",
    "2026-09-30T11:59:00Z",
    "2026-10-01T00:30:00Z",
    "2026-12-31T23:00:00Z",
    "2027-01-01T01:00:00Z",
    "2026-03-01T12:00:00Z",
  ];

  it("covers every zone's current week and month", () => {
    for (const iso of instants) {
      const now = new Date(iso);
      const { from, to } = statsWindow(now);
      for (const tz of zones) {
        const today = todayIn(tz, now);
        const need = [weekStart(today), monthStart(today), addDays(weekStart(today), 6)];
        for (const d of need) {
          expect(d >= from && d <= to, `${iso} ${tz} ${d} in ${from}..${to}`).toBe(true);
        }
        // Last day of the viewer's month.
        const nextMonth = monthStart(addDays(monthStart(today), 31));
        expect(addDays(nextMonth, -1) <= to, `${iso} ${tz} month end`).toBe(true);
      }
    }
  });

  it("is a few weeks, not unbounded", () => {
    const { from, to } = statsWindow(new Date("2026-10-01T00:30:00Z"));
    expect(from).toBe("2026-09-01");
    expect(to).toBe("2026-10-31");
  });
});
