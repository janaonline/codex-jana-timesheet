const {
  prismaMock,
  getSystemConfigurationMock,
  safeWriteAuditLogMock,
} = vi.hoisted(() => ({
  prismaMock: {
    timesheet: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getSystemConfigurationMock: vi.fn(),
  safeWriteAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/services/configuration-service", () => ({
  getSystemConfiguration: getSystemConfigurationMock,
}));

vi.mock("@/services/audit-service", () => ({
  safeWriteAuditLog: safeWriteAuditLogMock,
}));

import { updateTimesheetCalendar } from "@/services/timesheet-service";

function buildUser() {
  return {
    id: "user-1",
    email: "director@janaagraha.org",
    name: "Director One",
    role: "PROGRAM_HEAD",
    joinDate: null,
    exitDate: null,
  };
}

function buildEntry(
  id: string,
  workDate: string,
  minutes: number,
  projectId = "project-1",
) {
  return {
    id,
    timesheetId: "timesheet-1",
    projectId,
    workDate: new Date(`${workDate}T00:00:00+05:30`),
    minutes,
    hours: minutes / 60,
    description: `${workDate} entry`,
    createdVia: "DAY",
    lastEditedVia: "DAY",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    project: {
      id: projectId,
      code: "WAT",
      name: "Water Program",
    },
  };
}

function buildTimesheetRecord(params?: {
  version?: number;
  entries?: Array<ReturnType<typeof buildEntry>>;
  dayStates?: Array<{
    id: string;
    workDate: Date;
    leaveType: "NONE" | "HALF_DAY" | "FULL_DAY";
    isPersonalNonWorkingDay: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    id: "timesheet-1",
    userId: "user-1",
    user: buildUser(),
    monthKey: "2026-03",
    monthStart: new Date("2026-03-01T00:00:00+05:30"),
    leaveDays: 0,
    workingDaysCount: 22,
    assignedHours: 176,
    assignedMinutes: 10560,
    status: "DRAFT",
    version: params?.version ?? 4,
    autoSubmitted: false,
    submittedAt: null,
    frozenAt: null,
    editApprovedAt: null,
    editWindowClosesAt: null,
    rejectionReason: null,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    entries: params?.entries ?? [],
    dayStates: params?.dayStates ?? [],
    editRequests: [],
    emailLogs: [],
    auditLogs: [],
  };
}

describe("timesheet calendar updates", () => {
  beforeEach(() => {
    prismaMock.timesheet.findUnique.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.$transaction.mockReset();
    getSystemConfigurationMock.mockReset();
    safeWriteAuditLogMock.mockReset();
    getSystemConfigurationMock.mockResolvedValue({
      holidayCalendar: [],
    });
    safeWriteAuditLogMock.mockResolvedValue(undefined);
  });

  it("requires confirmation before a holiday clears existing entries for that date", async () => {
    const existing = buildTimesheetRecord({
      entries: [buildEntry("entry-1", "2026-03-03", 120)],
    });
    prismaMock.timesheet.findUnique.mockResolvedValue(existing);
    prismaMock.user.findUnique.mockResolvedValue(existing.user);

    await expect(
      updateTimesheetCalendar({
        timesheetId: existing.id,
        actor: { userId: existing.userId, role: "PROGRAM_HEAD" },
        version: existing.version,
        reference: new Date("2026-03-10T12:00:00+05:30"),
        updates: [
          {
            workDate: "2026-03-03",
            leaveType: "NONE",
            isManualHoliday: true,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "HOLIDAY_CONFIRMATION_REQUIRED",
      status: 409,
      details: expect.arrayContaining([expect.stringContaining("2026-03-03")]),
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(safeWriteAuditLogMock).not.toHaveBeenCalled();
  });

  it("applies a holiday with confirmation by clearing only that date and incrementing the version", async () => {
    const existing = buildTimesheetRecord({
      entries: [
        buildEntry("entry-1", "2026-03-03", 120),
        buildEntry("entry-2", "2026-03-04", 180),
      ],
    });
    const updatedTimesheet = buildTimesheetRecord({
      version: 5,
      entries: [buildEntry("entry-2", "2026-03-04", 180)],
      dayStates: [
        {
          id: "day-state-1",
          workDate: new Date("2026-03-03T00:00:00+05:30"),
          leaveType: "NONE",
          isPersonalNonWorkingDay: true,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
    });
    const txMock = {
      timesheetDayState: {
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "day-state-1" }),
      },
      timesheetEntry: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      timesheet: {
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTimesheet),
      },
    };

    prismaMock.timesheet.findUnique.mockResolvedValue(existing);
    prismaMock.user.findUnique.mockResolvedValue(existing.user);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );

    const result = await updateTimesheetCalendar({
      timesheetId: existing.id,
      actor: { userId: existing.userId, role: "PROGRAM_HEAD" },
      version: existing.version,
      reference: new Date("2026-03-10T12:00:00+05:30"),
      updates: [
        {
          workDate: "2026-03-03",
          leaveType: "NONE",
          isManualHoliday: true,
          confirmEntryClear: true,
        },
      ],
    });

    const deleteArgs = txMock.timesheetEntry.deleteMany.mock.calls[0][0];
    expect(deleteArgs.where.timesheetId).toBe(existing.id);
    expect(deleteArgs.where.workDate.in).toHaveLength(1);
    expect(deleteArgs.where.workDate.in[0].toISOString()).toBe(
      new Date("2026-03-03T00:00:00+05:30").toISOString(),
    );
    expect(txMock.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({
          version: { increment: 1 },
          assignedMinutes: 9120,
          assignedHours: 152,
        }),
      }),
    );
    expect(safeWriteAuditLogMock.mock.calls.map((call) => call[0].action)).toEqual([
      "TIMESHEET_MANUAL_HOLIDAY_ENTRIES_CLEARED",
      "TIMESHEET_CALENDAR_UPDATED",
    ]);
    expect(safeWriteAuditLogMock.mock.calls[1][0]).toMatchObject({
      action: "TIMESHEET_CALENDAR_UPDATED",
      metadata: expect.objectContaining({
        rowsUpdated: 1,
        rowsDeleted: 1,
        entryClearConfirmed: true,
        manualHolidayDates: ["2026-03-03"],
      }),
    });
    expect(result.timesheet.version).toBe(5);
    expect(result.timesheet.totalMinutes).toBe(180);
    expect(result.timesheet.assignedMinutes).toBe(9120);
    expect(
      result.timesheet.calendarDays.find((day) => day.workDate === "2026-03-03"),
    ).toMatchObject({
      isManualHoliday: true,
      capacityMinutes: 0,
    });
  });

  it("saves a holiday without confirmation when the date has no entries", async () => {
    const existing = buildTimesheetRecord({
      entries: [buildEntry("entry-1", "2026-03-04", 180)],
    });
    const updatedTimesheet = buildTimesheetRecord({
      version: 5,
      entries: [buildEntry("entry-1", "2026-03-04", 180)],
      dayStates: [
        {
          id: "day-state-1",
          workDate: new Date("2026-03-03T00:00:00+05:30"),
          leaveType: "NONE",
          isPersonalNonWorkingDay: true,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      ],
    });
    const txMock = {
      timesheetDayState: {
        findMany: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        update: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: "day-state-1" }),
      },
      timesheetEntry: {
        deleteMany: vi.fn(),
      },
      timesheet: {
        update: vi.fn().mockResolvedValue({}),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTimesheet),
      },
    };

    prismaMock.timesheet.findUnique.mockResolvedValue(existing);
    prismaMock.user.findUnique.mockResolvedValue(existing.user);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );

    const result = await updateTimesheetCalendar({
      timesheetId: existing.id,
      actor: { userId: existing.userId, role: "PROGRAM_HEAD" },
      version: existing.version,
      reference: new Date("2026-03-10T12:00:00+05:30"),
      updates: [
        {
          workDate: "2026-03-03",
          leaveType: "NONE",
          isManualHoliday: true,
        },
      ],
    });

    expect(txMock.timesheetEntry.deleteMany).not.toHaveBeenCalled();
    expect(result.timesheet.totalMinutes).toBe(180);
    expect(result.timesheet.assignedMinutes).toBe(9120);
  });
});
