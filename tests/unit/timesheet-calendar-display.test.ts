import {
  formatDayUtilization,
  isExactlyUtilized,
  sumMinutesByWorkDate,
} from "@/lib/timesheet-calendar-display";

describe("timesheet calendar display", () => {
  it("formats working-day and half-day utilization using minute-based recorded and available hours", () => {
    expect(formatDayUtilization(180, 480)).toBe("3/8 hrs");
    expect(formatDayUtilization(180, 240)).toBe("3/4 hrs");
    expect(formatDayUtilization(240, 240)).toBe("4/4 hrs");
  });

  it("renders a dash for zero-capacity dates such as full-day leave or holidays", () => {
    expect(formatDayUtilization(0, 0)).toBe("-");
    expect(formatDayUtilization(120, 0)).toBe("-");
  });

  it("marks completion only on exact minute equality with positive capacity", () => {
    expect(isExactlyUtilized(480, 480)).toBe(true);
    expect(isExactlyUtilized(240, 240)).toBe(true);
    expect(isExactlyUtilized(470, 480)).toBe(false);
    expect(isExactlyUtilized(479, 480)).toBe(false);
    expect(isExactlyUtilized(0, 0)).toBe(false);
  });

  it("groups recorded minutes by date for day-card utilization updates", () => {
    expect(
      sumMinutesByWorkDate([
        { workDate: "2026-03-03", minutes: 120 },
        { workDate: "2026-03-03", minutes: 60 },
        { workDate: "2026-03-04", minutes: 240 },
      ]),
    ).toEqual({
      "2026-03-03": 180,
      "2026-03-04": 240,
    });
  });
});
