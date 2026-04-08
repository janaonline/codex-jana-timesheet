import {
  calculateAssignedHours,
  deriveLegacyDayStates,
  distributeMinutesEvenly,
  minutesToHours,
  normalizeHoursInputToMinutes,
  validateTimesheetInput,
} from "@/lib/timesheet-calculations";

describe("timesheet calculations", () => {
  it("derives assigned minutes from date capacity, leave, and personal non-working days", () => {
    const result = calculateAssignedHours({
      monthKey: "2026-03",
      joinDate: null,
      exitDate: null,
      holidays: ["2026-03-20"],
      dayStates: [
        {
          workDate: "2026-03-05",
          leaveType: "FULL_DAY",
          isPersonalNonWorkingDay: false,
        },
        {
          workDate: "2026-03-06",
          leaveType: "HALF_DAY",
          isPersonalNonWorkingDay: false,
        },
        {
          workDate: "2026-03-09",
          leaveType: "NONE",
          isPersonalNonWorkingDay: true,
        },
      ],
      legacyLeaveDays: 0,
    });

    expect(result.workingDaysCount).toBe(21);
    expect(result.leaveDays).toBe(1.5);
    expect(result.assignedMinutes).toBe(8880);
    expect(result.assignedHours).toBe(148);
  });

  it("normalizes common decimal hour inputs to 10-minute increments", () => {
    expect(normalizeHoursInputToMinutes(1.17)).toEqual({
      ok: true,
      minutes: 70,
    });
    expect(normalizeHoursInputToMinutes(1.33)).toEqual({
      ok: true,
      minutes: 80,
    });
    expect(normalizeHoursInputToMinutes(1.25)).toEqual({
      ok: false,
      error:
        "Hours must align to 10-minute increments, for example 1, 1.17, 1.33, or 1.5.",
    });
  });

  it("creates deterministic legacy leave day states for backfill compatibility", () => {
    const result = deriveLegacyDayStates({
      monthKey: "2026-03",
      leaveDays: 1.5,
      joinDate: null,
      exitDate: null,
      holidays: [],
    });

    expect(result).toEqual([
      {
        workDate: "2026-03-02",
        leaveType: "FULL_DAY",
        isPersonalNonWorkingDay: false,
      },
      {
        workDate: "2026-03-03",
        leaveType: "HALF_DAY",
        isPersonalNonWorkingDay: false,
      },
    ]);
  });

  it("prevents entries on zero-capacity dates and requires exact submit totals", () => {
    const capacity = calculateAssignedHours({
      monthKey: "2026-03",
      joinDate: null,
      exitDate: null,
      holidays: [],
      dayStates: [
        {
          workDate: "2026-03-02",
          leaveType: "FULL_DAY",
          isPersonalNonWorkingDay: false,
        },
      ],
      legacyLeaveDays: 0,
    });

    const draftValidation = validateTimesheetInput({
      mode: "draft",
      assignedMinutes: capacity.assignedMinutes,
      calendarDays: capacity.calendarDays,
      entries: [
        {
          workDate: "2026-03-02",
          projectId: "project-1",
          minutes: 60,
          description: "",
        },
      ],
    });

    expect(draftValidation.errors).toContain(
      "Entry 1: 2026-03-02 cannot accept time because the date capacity is 0.",
    );

    const submitValidation = validateTimesheetInput({
      mode: "submit",
      assignedMinutes: 480,
      calendarDays: capacity.calendarDays,
      entries: [
        {
          workDate: "2026-03-03",
          projectId: "project-1",
          minutes: 470,
          description: "Delivery work",
        },
      ],
    });

    expect(submitValidation.errors).toContain(
      "Total Hours does not match assigned hours.",
    );
  });

  it("distributes minutes evenly with earliest-date remainder handling", () => {
    const distribution = distributeMinutesEvenly({
      totalMinutes: 500,
      targets: [
        { workDate: "2026-03-03", capacityMinutes: 480 },
        { workDate: "2026-03-04", capacityMinutes: 480 },
        { workDate: "2026-03-05", capacityMinutes: 480 },
      ],
    });

    expect(distribution).toEqual([
      { workDate: "2026-03-03", minutes: 170 },
      { workDate: "2026-03-04", minutes: 170 },
      { workDate: "2026-03-05", minutes: 160 },
    ]);
    expect(distribution.map((entry) => minutesToHours(entry.minutes))).toEqual([
      2.83,
      2.83,
      2.67,
    ]);
  });
});
