const {
  prismaMock,
  getSystemConfigurationMock,
  safeWriteAuditLogMock,
} = vi.hoisted(() => ({
  prismaMock: {
    timesheet: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    editRequest: {
      findMany: vi.fn(),
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

import {
  createTimesheetForUser,
  listPendingEditRequests,
  requestEdit,
} from "@/services/timesheet-service";

function buildUser(role: "PROGRAM_HEAD" | "ASSOCIATE_DIRECTOR" = "PROGRAM_HEAD") {
  return {
    id: "user-1",
    email: "director@janaagraha.org",
    name: role === "ASSOCIATE_DIRECTOR" ? "Asha Associate Director" : "Ravi Director",
    role,
    joinDate: null,
    exitDate: null,
    approverUserId: "admin-1",
  };
}

function buildTimesheetRecord(params?: {
  monthKey?: string;
  status?: string;
  user?: ReturnType<typeof buildUser>;
  editRequests?: Array<{
    id: string;
    status: string;
    reason: string;
    decisionReason: string | null;
    requestedAt: Date;
    reviewedAt: Date | null;
    requestedBy: { name: string };
    reviewedBy: { name: string } | null;
  }>;
}) {
  const user = params?.user ?? buildUser();

  return {
    id: "timesheet-1",
    userId: user.id,
    user,
    monthKey: params?.monthKey ?? "2026-01",
    monthStart: new Date("2026-01-01T00:00:00+05:30"),
    leaveDays: 0,
    workingDaysCount: 22,
    assignedHours: 176,
    assignedMinutes: 10560,
    status: params?.status ?? "FROZEN",
    version: 1,
    autoSubmitted: false,
    submittedAt: new Date("2026-02-05T00:00:00+05:30"),
    frozenAt: new Date("2026-02-05T00:00:00+05:30"),
    editApprovedAt: null,
    editWindowClosesAt: null,
    rejectionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    entries: [],
    dayStates: [],
    editRequests: params?.editRequests ?? [],
    emailLogs: [],
    auditLogs: [],
  };
}

describe("timesheet service historical edit requests", () => {
  beforeEach(() => {
    prismaMock.timesheet.findUnique.mockReset();
    prismaMock.timesheet.upsert.mockReset();
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findMany.mockReset();
    prismaMock.editRequest.findMany.mockReset();
    prismaMock.$transaction.mockReset();
    getSystemConfigurationMock.mockReset();
    safeWriteAuditLogMock.mockReset();

    getSystemConfigurationMock.mockResolvedValue({
      holidayCalendar: [],
    });
    safeWriteAuditLogMock.mockResolvedValue(undefined);
  });

  it("creates a missing historical timesheet as frozen and immediately requestable", async () => {
    const user = buildUser("ASSOCIATE_DIRECTOR");
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.timesheet.upsert.mockImplementation(async ({ create }) =>
      buildTimesheetRecord({
        user,
        monthKey: create.monthKey,
        status: create.status,
      }),
    );

    const timesheet = await createTimesheetForUser(
      user.id,
      "2026-01",
      new Date("2026-03-10T12:00:00+05:30"),
    );

    expect(prismaMock.timesheet.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          monthKey: "2026-01",
          status: "FROZEN",
        }),
      }),
    );
    expect(timesheet.status).toBe("FROZEN");
    expect(timesheet.entries).toEqual([]);
    expect(timesheet.canRequestEdit).toBe(true);
  });

  it("submits an edit request for a zero-entry frozen historical month and preserves admin routing", async () => {
    const user = buildUser("ASSOCIATE_DIRECTOR");
    const existing = buildTimesheetRecord({
      user,
      monthKey: "2026-01",
      status: "FROZEN",
    });
    const updated = buildTimesheetRecord({
      user,
      monthKey: "2026-01",
      status: "EDIT_REQUESTED",
      editRequests: [
        {
          id: "request-1",
          status: "PENDING",
          reason: "Need to correct historical minutes",
          decisionReason: null,
          requestedAt: new Date("2026-03-10T06:30:00.000Z"),
          reviewedAt: null,
          requestedBy: { name: user.name },
          reviewedBy: null,
        },
      ],
    });
    const txMock = {
      editRequest: {
        create: vi.fn().mockResolvedValue({
          id: "request-1",
          timesheetId: existing.id,
          requestedById: user.id,
          reason: "Need to correct historical minutes",
          status: "PENDING",
          requestedAt: new Date("2026-03-10T06:30:00.000Z"),
        }),
      },
      timesheet: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    prismaMock.timesheet.findUnique
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: "admin-1",
        name: "Girija Admin",
        email: "girija@janaagraha.org",
      },
    ]);
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof txMock) => unknown) =>
      callback(txMock),
    );

    const result = await requestEdit({
      timesheetId: existing.id,
      actor: {
        userId: user.id,
        role: user.role,
      },
      reason: "Need to correct historical minutes",
      reference: new Date("2026-03-10T12:00:00+05:30"),
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "admin-1" },
      }),
    );
    expect(txMock.editRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          timesheetId: existing.id,
          requestedById: user.id,
          status: "PENDING",
        }),
      }),
    );
    expect(txMock.timesheet.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({
          status: "EDIT_REQUESTED",
        }),
      }),
    );
    expect(result.timesheet.status).toBe("EDIT_REQUESTED");
    expect(result.timesheet.entries).toEqual([]);
    expect(result.approvers).toEqual([
      {
        id: "admin-1",
        name: "Girija Admin",
        email: "girija@janaagraha.org",
      },
    ]);
  });

  it("returns pending historical requests in the admin list query", async () => {
    prismaMock.editRequest.findMany.mockResolvedValue([
      {
        id: "request-1",
        status: "PENDING",
        requestedBy: {
          name: "Asha Associate Director",
          email: "asha@janaagraha.org",
        },
        timesheet: {
          user: {
            name: "Asha Associate Director",
          },
          monthKey: "2026-01",
        },
      },
    ]);

    const requests = await listPendingEditRequests();

    expect(prismaMock.editRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PENDING" },
      }),
    );
    expect(requests).toHaveLength(1);
  });
});
