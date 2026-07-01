import { addWorkingDaysFromNextBusinessDay, getReminderRun } from "@/lib/time";
import {
  canEditTimesheet,
  canSubmitTimesheet,
  canRequestEdit,
  getTimesheetViewAvailability,
  isEligibleForAutoSubmit,
  isEligibleForReminder,
  shouldExpireEditWindow,
  shouldFreezeAfterCutoff,
} from "@/lib/workflow-rules";

describe("workflow rules", () => {
  it("allows auto-submit only at the exact 25th 12:00 AM IST moment", () => {
    expect(
      isEligibleForAutoSubmit({
        status: "DRAFT",
        assignedMinutes: 9600,
        totalMinutes: 9600,
        monthKey: "2026-05",
        reference: new Date("2026-05-24T18:30:00.000Z"),
      }),
    ).toBe(true);

    expect(
      isEligibleForAutoSubmit({
        status: "DRAFT",
        assignedMinutes: 9600,
        totalMinutes: 9600,
        monthKey: "2026-05",
        reference: new Date("2026-05-25T01:00:00+05:30"),
      }),
    ).toBe(false);
  });

  it("freezes draft previous-month timesheets after the cutoff", () => {
    expect(
      shouldFreezeAfterCutoff({
        status: "DRAFT",
        monthKey: "2026-05",
        reference: new Date("2026-05-24T18:30:00.000Z"),
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

  it("allows edit requests for eligible past-month owner timesheets", () => {
    expect(
      canRequestEdit({
        status: "DRAFT",
        monthKey: "2026-02",
        reference: new Date("2026-03-03T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "DRAFT",
        monthKey: "2026-02",
        reference: new Date("2026-03-03T12:00:00+05:30"),
        role: "ASSOCIATE_DIRECTOR",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "FROZEN",
        monthKey: "2026-02",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "FROZEN",
        monthKey: "2026-01",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "AUTO_SUBMITTED",
        monthKey: "2026-01",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "ASSOCIATE_DIRECTOR",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "REJECTED",
        monthKey: "2026-01",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(true);

    expect(
      canRequestEdit({
        status: "DRAFT",
        monthKey: "2026-03",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(false);

    expect(
      canRequestEdit({
        status: "SUBMITTED",
        monthKey: "2026-03",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "PROGRAM_HEAD",
      }),
    ).toBe(false);

    expect(
      canRequestEdit({
        status: "FROZEN",
        monthKey: "2026-01",
        reference: new Date("2026-03-10T12:00:00+05:30"),
        role: "ADMIN",
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

  it("allows EDIT_APPROVED editing for historical months within the approval window", () => {
    const editableUntil = new Date("2026-07-06T23:59:59+05:30");

    expect(
      canEditTimesheet({
        status: "EDIT_APPROVED",
        monthKey: "2026-03",
        reference: new Date("2026-07-01T10:00:00+05:30"),
        editWindowClosesAt: editableUntil,
      }),
    ).toBe(true);

    expect(
      canEditTimesheet({
        status: "EDIT_APPROVED",
        monthKey: "2026-03",
        reference: new Date("2026-07-07T10:00:00+05:30"),
        editWindowClosesAt: editableUntil,
      }),
    ).toBe(false);

    expect(
      getTimesheetViewAvailability({
        status: "EDIT_APPROVED",
        monthKey: "2026-03",
        reference: new Date("2026-07-01T10:00:00+05:30"),
        editWindowClosesAt: editableUntil,
      }),
    ).toEqual({ day: true, week: false, month: false });
  });

  it("limits reopened previous-month sheets to day view while keeping current drafts fully multi-mode", () => {
    expect(
      getTimesheetViewAvailability({
        status: "EDIT_APPROVED",
        monthKey: "2026-02",
        reference: new Date("2026-03-12T18:00:00+05:30"),
        editWindowClosesAt: new Date("2026-03-14T23:59:59+05:30"),
      }),
    ).toEqual({
      day: true,
      week: false,
      month: false,
    });

    expect(
      getTimesheetViewAvailability({
        status: "DRAFT",
        monthKey: "2026-03",
        reference: new Date("2026-03-12T18:00:00+05:30"),
      }),
    ).toEqual({
      day: true,
      week: true,
      month: true,
    });
  });

  it("maps reminder schedules to the expected month context", () => {
    expect(getReminderRun(new Date("2026-05-15T00:00:00+05:30"))).toEqual({
      kind: "REMINDER_25TH",
      targetMonthKey: "2026-05",
    });
    expect(getReminderRun(new Date("2026-05-22T00:00:00+05:30"))).toEqual({
      kind: "REMINDER_3RD",
      targetMonthKey: "2026-05",
    });
    expect(getReminderRun(new Date("2026-05-25T00:00:00+05:30"))).toEqual({
      kind: "FINAL_NOTICE_5TH",
      targetMonthKey: "2026-05",
    });
  });

  it("blocks manual submission after the 25th cutoff", () => {
    expect(
      canSubmitTimesheet({
        status: "DRAFT",
        monthKey: "2026-05",
        reference: new Date("2026-05-24T23:59:00+05:30"),
        isExactlyComplete: true,
      }),
    ).toBe(true);

    expect(
      canSubmitTimesheet({
        status: "DRAFT",
        monthKey: "2026-05",
        reference: new Date("2026-05-25T00:00:00+05:30"),
        isExactlyComplete: true,
      }),
    ).toBe(false);
  });
});
