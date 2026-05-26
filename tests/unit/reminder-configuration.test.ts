import { getReminderRun } from "@/lib/time";

describe("reminder scheduling configuration", () => {
  it("uses configured reminder days when provided", () => {
    const config = {
      currentMonthDraftDays: [14, 17],
      currentMonthSubmitDay: "last-day" as const,
      nextMonthPendingDays: [21, 23],
    };

    expect(getReminderRun(new Date("2026-05-14T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_25TH",
      targetMonthKey: "2026-05",
    });
    expect(getReminderRun(new Date("2026-05-21T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-05",
    });
  });

  it("keeps the final 25th-day notice fixed even when reminder config includes day 25", () => {
    const config = {
      currentMonthDraftDays: [25, 18],
      currentMonthSubmitDay: "last-day" as const,
      nextMonthPendingDays: [25],
    };

    expect(getReminderRun(new Date("2026-05-22T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-05",
    });
    expect(getReminderRun(new Date("2026-05-25T00:00:00+05:30"), config)).toEqual({
      kind: "FINAL_NOTICE_5TH",
      targetMonthKey: "2026-05",
    });
  });
});
