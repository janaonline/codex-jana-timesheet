import { formatInTimeZone } from "date-fns-tz";

import {
  getCurrentTimesheetMonthKey,
  getPreviousMonthKey,
  getTimesheetPeriod,
  getTimesheetPeriodDates,
  isDateInTimesheetPeriod,
} from "@/lib/time";

describe("timesheet period helpers", () => {
  it.each([
    {
      monthKey: "2026-05",
      start: "2026-04-20",
      endExclusive: "2026-05-20",
      visibleEnd: "2026-05-19",
      autoSubmitAt: "2026-05-25 00:00",
    },
    {
      monthKey: "2026-06",
      start: "2026-05-20",
      endExclusive: "2026-06-20",
      visibleEnd: "2026-06-19",
      autoSubmitAt: "2026-06-25 00:00",
    },
    {
      monthKey: "2026-01",
      start: "2025-12-20",
      endExclusive: "2026-01-20",
      visibleEnd: "2026-01-19",
      autoSubmitAt: "2026-01-25 00:00",
    },
  ])("calculates payroll period boundaries for $monthKey", (scenario) => {
    const period = getTimesheetPeriod(scenario.monthKey);

    expect(formatInTimeZone(period.periodStart, "Asia/Kolkata", "yyyy-MM-dd")).toBe(
      scenario.start,
    );
    expect(
      formatInTimeZone(period.periodEndExclusive, "Asia/Kolkata", "yyyy-MM-dd"),
    ).toBe(scenario.endExclusive);
    expect(
      formatInTimeZone(period.visiblePeriodEnd, "Asia/Kolkata", "yyyy-MM-dd"),
    ).toBe(scenario.visibleEnd);
    expect(
      formatInTimeZone(period.autoSubmitAt, "Asia/Kolkata", "yyyy-MM-dd HH:mm"),
    ).toBe(scenario.autoSubmitAt);
  });

  it("uses an inclusive start and exclusive end boundary", () => {
    expect(isDateInTimesheetPeriod("2026-05-19", "2026-05")).toBe(true);
    expect(isDateInTimesheetPeriod("2026-05-20", "2026-05")).toBe(false);
    expect(isDateInTimesheetPeriod("2026-05-20", "2026-06")).toBe(true);
  });

  it("lists only the dates inside the computed period", () => {
    const dates = getTimesheetPeriodDates("2026-05");

    expect(dates[0]).toBe("2026-04-20");
    expect(dates.at(-1)).toBe("2026-05-19");
    expect(dates).toHaveLength(30);
    expect(dates).not.toContain("2026-05-20");
  });

  it("resolves current and previous timesheet keys from the payroll boundary", () => {
    expect(getCurrentTimesheetMonthKey(new Date("2026-05-19T23:59:00+05:30"))).toBe(
      "2026-05",
    );
    expect(getCurrentTimesheetMonthKey(new Date("2026-05-20T00:00:00+05:30"))).toBe(
      "2026-06",
    );
    expect(getPreviousMonthKey(new Date("2026-05-25T00:00:00+05:30"))).toBe(
      "2026-05",
    );
  });
});
