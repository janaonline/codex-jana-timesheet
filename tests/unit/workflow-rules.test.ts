import { addWorkingDaysFromNextBusinessDay, getReminderRun } from "@/lib/time";
import {
  canEditTimesheet,
  canRequestEdit,
  isEligibleForAutoSubmit,
  isEligibleForReminder,
  shouldExpireEditWindow,
  shouldFreezeAfterCutoff,
} from "@/lib/workflow-rules";

describe("workflow rules", () => {
  it("allows auto-submit only at the exact 5th 12:00 AM IST moment", () => {
    expect(
      isEligibleForAutoSubmit({
        status: "DRAFT",
        assignedHours: 160,
        totalHours: 160,
        monthKey: "2026-02",
        reference: new Date("2026-03-04T18:30:00.000Z"),
      }),
    ).toBe(true);

    expect(
      isEligibleForAutoSubmit({
        status: "DRAFT",
        assignedHours: 160,
        totalHours: 160,
        monthKey: "2026-02",
        reference: new Date("2026-03-05T01:00:00+05:30"),
      }),
    ).toBe(false);
  });

  it("freezes draft previous-month timesheets after the cutoff", () => {
    expect(
      shouldFreezeAfterCutoff({
        status: "DRAFT",
        monthKey: "2026-02",
        reference: new Date("2026-03-04T18:30:00.000Z"),
      }),
    ).toBe(true);
  });

  it("sends reminders only to eligible pending users", () => {
    expect(
      isEligibleForReminder({
        kind: "REMINDER_25TH",
        status: "DRAFT",
        completionPercentage: 50,
      }),
    ).toBe(true);

    expect(
      isEligibleForReminder({
        kind: "REMINDER_25TH",
        status: "SUBMITTED",
        completionPercentage: 100,
      }),
    ).toBe(false);
  });

  it("allows edit requests only for previous-month locked states", () => {
    expect(
      canRequestEdit({
        status: "FROZEN",
        monthKey: "2026-02",
        reference: new Date("2026-03-10T12:00:00+05:30"),
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "FROZEN",
        monthKey: "2026-01",
        reference: new Date("2026-03-10T12:00:00+05:30"),
      }),
    ).toBe(false);
  });

  it("expires edit approval after the configured 3-working-day window", () => {
    const editableUntil = addWorkingDaysFromNextBusinessDay(
      new Date("2026-03-09T10:00:00+05:30"),
      3,
      [],
    );

    expect(
      canEditTimesheet({
        status: "EDIT_APPROVED",
        monthKey: "2026-02",
        reference: new Date("2026-03-12T18:00:00+05:30"),
        editWindowClosesAt: editableUntil,
      }),
    ).toBe(true);

    expect(
      shouldExpireEditWindow({
        status: "EDIT_APPROVED",
        reference: new Date("2026-03-13T09:00:00+05:30"),
        editWindowClosesAt: editableUntil,
      }),
    ).toBe(true);
  });

  it("maps reminder schedules to the expected month context", () => {
    expect(getReminderRun(new Date("2026-02-25T00:00:00+05:30"))).toEqual({
      kind: "REMINDER_25TH",
      targetMonthKey: "2026-02",
    });
    expect(getReminderRun(new Date("2026-03-03T00:00:00+05:30"))).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-02",
    });
  });
});
