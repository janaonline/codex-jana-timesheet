import { getReminderRun } from "@/lib/time";

describe("reminder scheduling configuration", () => {
  it("uses configured reminder days when provided", () => {
    const config = {
      currentMonthDraftDays: [24, 27],
      currentMonthSubmitDay: "last-day" as const,
      nextMonthPendingDays: [2, 4],
    };

    expect(getReminderRun(new Date("2026-02-24T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_25TH",
      targetMonthKey: "2026-02",
    });
    expect(getReminderRun(new Date("2026-03-02T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-02",
    });
  });

  it("keeps the final 5th-day notice fixed even when next-month config includes day 5", () => {
    const config = {
      currentMonthDraftDays: [25, 28],
      currentMonthSubmitDay: "last-day" as const,
      nextMonthPendingDays: [5],
    };

    expect(getReminderRun(new Date("2026-03-03T00:00:00+05:30"), config)).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-02",
    });
    expect(getReminderRun(new Date("2026-03-05T00:00:00+05:30"), config)).toEqual({
      kind: "FINAL_NOTICE_5TH",
      targetMonthKey: "2026-02",
    });
  });
});
