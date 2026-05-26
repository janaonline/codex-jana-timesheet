import {
  calculateAssignedHours,
  deriveLegacyDayStates,
  distributeMinutesEvenly,
  listWeekdaysForWeekInMonth,
  minutesToHours,
  normalizeHoursInputToMinutes,
  validateTimesheetInput,
} from "@/lib/timesheet-calculations";

describe("timesheet calculations", () => {
  it("derives working, leave, and holiday capacities from the effective day state", () => {
    const result = calculateAssignedHours({
      monthKey: "2026-03",
      joinDate: null,
      exitDate: null,
      holidays: ["2026-03-18"],
      dayStates: [
        {
          workDate: "2026-03-05",
          leaveType: "FULL_DAY",
          isManualHoliday: false,
        },
        {
          workDate: "2026-03-06",
          leaveType: "HALF_DAY",
          isManualHoliday: false,
        },
        {
          workDate: "2026-03-09",
          leaveType: "NONE",
          isManualHoliday: true,
        },
      ],
      legacyLeaveDays: 0,
    });

    const calendarDayMap = new Map(
      result.calendarDays.map((day) => [day.workDate, day]),
    );

    expect(calendarDayMap.get("2026-03-04")?.capacityMinutes).toBe(480);
    expect(calendarDayMap.get("2026-03-05")?.capacityMinutes).toBe(0);
    expect(calendarDayMap.get("2026-03-06")?.capacityMinutes).toBe(240);
    expect(calendarDayMap.get("2026-03-09")?.capacityMinutes).toBe(0);
    expect(calendarDayMap.get("2026-03-18")?.capacityMinutes).toBe(0);
    expect(calendarDayMap.has("2026-03-20")).toBe(false);
    expect(result.workingDaysCount).toBe(19);
    expect(result.leaveDays).toBe(1.5);
    expect(result.assignedMinutes).toBe(7920);
    expect(result.assignedHours).toBe(132);
  });

  it("restores full capacity when a holiday is switched back to a working day", () => {
    const withHoliday = calculateAssignedHours({
      monthKey: "2026-03",
      joinDate: null,
      exitDate: null,
      holidays: [],
      dayStates: [
        {
          workDate: "2026-03-09",
          leaveType: "NONE",
          isManualHoliday: true,
        },
      ],
      legacyLeaveDays: 0,
    });

    const withoutHoliday = calculateAssignedHours({
      monthKey: "2026-03",
      joinDate: null,
      exitDate: null,
      holidays: [],
      dayStates: [],
      legacyLeaveDays: 0,
    });

    expect(withHoliday.assignedMinutes).toBe(9120);
    expect(withoutHoliday.assignedMinutes).toBe(9600);
    expect(withoutHoliday.assignedMinutes - withHoliday.assignedMinutes).toBe(480);
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
        workDate: "2026-02-20",
        leaveType: "FULL_DAY",
        isManualHoliday: false,
      },
      {
        workDate: "2026-02-23",
        leaveType: "HALF_DAY",
        isManualHoliday: false,
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
          isManualHoliday: false,
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

  it("validates entries against the payroll-aligned period boundaries", () => {
    const mayCapacity = calculateAssignedHours({
      monthKey: "2026-05",
      joinDate: null,
      exitDate: null,
      holidays: [],
      dayStates: [],
      legacyLeaveDays: 0,
    });
    const juneCapacity = calculateAssignedHours({
      monthKey: "2026-06",
      joinDate: null,
      exitDate: null,
      holidays: [],
      dayStates: [],
      legacyLeaveDays: 0,
    });

    expect(
      validateTimesheetInput({
        mode: "draft",
        assignedMinutes: mayCapacity.assignedMinutes,
        calendarDays: mayCapacity.calendarDays,
        entries: [
          {
            workDate: "2026-04-20",
            projectId: "project-1",
            minutes: 60,
            description: "",
          },
          {
            workDate: "2026-05-19",
            projectId: "project-1",
            minutes: 60,
            description: "",
          },
        ],
      }).errors,
    ).toEqual([]);

    expect(
      validateTimesheetInput({
        mode: "draft",
        assignedMinutes: mayCapacity.assignedMinutes,
        calendarDays: mayCapacity.calendarDays,
        entries: [
          {
            workDate: "2026-04-19",
            projectId: "project-1",
            minutes: 60,
            description: "",
          },
          {
            workDate: "2026-05-20",
            projectId: "project-1",
            minutes: 60,
            description: "",
          },
        ],
      }).errors,
    ).toEqual([
      "Entry 1: date must belong to the selected timesheet period.",
      "Entry 2: date must belong to the selected timesheet period.",
    ]);

    expect(
      validateTimesheetInput({
        mode: "draft",
        assignedMinutes: juneCapacity.assignedMinutes,
        calendarDays: juneCapacity.calendarDays,
        entries: [
          {
            workDate: "2026-05-20",
            projectId: "project-1",
            minutes: 60,
            description: "",
          },
        ],
      }).errors,
    ).toEqual([]);
  });

  it("applies join and exit dates inside the payroll-aligned period", () => {
    const result = calculateAssignedHours({
      monthKey: "2026-05",
      joinDate: new Date("2026-04-27T00:00:00+05:30"),
      exitDate: new Date("2026-05-08T00:00:00+05:30"),
      holidays: [],
      dayStates: [],
      legacyLeaveDays: 0,
    });

    expect(result.calendarDays.find((day) => day.workDate === "2026-04-25")).toMatchObject({
      isWithinEmploymentWindow: false,
      baseCapacityMinutes: 0,
    });
    expect(result.calendarDays.find((day) => day.workDate === "2026-04-27")).toMatchObject({
      isWithinEmploymentWindow: true,
      baseCapacityMinutes: 480,
    });
    expect(result.calendarDays.find((day) => day.workDate === "2026-05-11")).toMatchObject({
      isWithinEmploymentWindow: false,
      baseCapacityMinutes: 0,
    });
    expect(result.assignedMinutes).toBe(4800);
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

  it("skips zero-capacity holiday dates during week and month allocation distribution", () => {
    const distribution = distributeMinutesEvenly({
      totalMinutes: 480,
      targets: [
        { workDate: "2026-03-03", capacityMinutes: 0 },
        { workDate: "2026-03-04", capacityMinutes: 240 },
        { workDate: "2026-03-05", capacityMinutes: 240 },
      ],
    });

    expect(distribution).toEqual([
      { workDate: "2026-03-04", minutes: 240 },
      { workDate: "2026-03-05", minutes: 240 },
    ]);
  });

  it("builds week allocation dates from the period start without crossing the period end", () => {
    expect(listWeekdaysForWeekInMonth("2026-04-20", "2026-05")).toEqual([
      "2026-04-20",
      "2026-04-21",
      "2026-04-22",
      "2026-04-23",
      "2026-04-24",
    ]);
    expect(listWeekdaysForWeekInMonth("2026-05-18", "2026-05")).toEqual([
      "2026-05-18",
      "2026-05-19",
    ]);
  });
});
