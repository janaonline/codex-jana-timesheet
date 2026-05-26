const {
  prismaMock,
  getSystemConfigurationMock,
  ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock,
  expireApprovedEditWindowsMock,
  getTimesheetEmailContextMock,
  submitTimesheetMock,
  sendAdminAutoSubmitNoticeMessageMock,
  sendFinalNoticeMessageMock,
  sendReminderMessageMock,
  sendSubmissionConfirmationMessageMock,
  safeWriteAuditLogMock,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findMany: vi.fn(),
    },
    timesheet: {
      update: vi.fn(),
    },
  },
  getSystemConfigurationMock: vi.fn(),
  ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock: vi.fn(),
  expireApprovedEditWindowsMock: vi.fn(),
  getTimesheetEmailContextMock: vi.fn(),
  submitTimesheetMock: vi.fn(),
  sendAdminAutoSubmitNoticeMessageMock: vi.fn(),
  sendFinalNoticeMessageMock: vi.fn(),
  sendReminderMessageMock: vi.fn(),
  sendSubmissionConfirmationMessageMock: vi.fn(),
  safeWriteAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/services/configuration-service", () => ({
  getSystemConfiguration: getSystemConfigurationMock,
}));

vi.mock("@/services/timesheet-service", () => ({
  ensurePreviousMonthTimesheetsForAllTimesheetOwners:
    ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock,
  ensureWindowTimesheets: vi.fn(),
  expireApprovedEditWindows: expireApprovedEditWindowsMock,
  getTimesheetEmailContext: getTimesheetEmailContextMock,
  submitTimesheet: submitTimesheetMock,
}));

vi.mock("@/services/email-service", () => ({
  sendAdminAutoSubmitNoticeMessage: sendAdminAutoSubmitNoticeMessageMock,
  sendFinalNoticeMessage: sendFinalNoticeMessageMock,
  sendReminderMessage: sendReminderMessageMock,
  sendSubmissionConfirmationMessage: sendSubmissionConfirmationMessageMock,
}));

vi.mock("@/services/audit-service", () => ({
  safeWriteAuditLog: safeWriteAuditLogMock,
}));

import { runAutoSubmitJob } from "@/services/job-service";

function buildTimesheet() {
  return {
    id: "timesheet-1",
    userId: "user-1",
    user: {
      id: "user-1",
      role: "PROGRAM_HEAD",
    },
  };
}

function buildEmailContext(params?: {
  totalMinutes?: number;
  assignedMinutes?: number;
  status?: string;
}) {
  const assignedMinutes = params?.assignedMinutes ?? 960;
  const totalMinutes = params?.totalMinutes ?? assignedMinutes;

  return {
    requestEditUrl: "http://localhost:3000/timesheets/timesheet-1",
    view: {
      id: "timesheet-1",
      userId: "user-1",
      ownerEmail: "director@janaagraha.org",
      ownerName: "Ravi Director",
      status: params?.status ?? "DRAFT",
      assignedMinutes,
      totalMinutes,
      monthKey: "2026-05",
      monthLabel: "May 2026 (20 Apr - 19 May)",
      completionPercentage: assignedMinutes > 0 ? (totalMinutes / assignedMinutes) * 100 : 0,
      remainingHours: (assignedMinutes - totalMinutes) / 60,
    },
  };
}

describe("auto-submit job", () => {
  beforeEach(() => {
    prismaMock.user.findMany.mockReset();
    prismaMock.timesheet.update.mockReset();
    getSystemConfigurationMock.mockReset();
    ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock.mockReset();
    expireApprovedEditWindowsMock.mockReset();
    getTimesheetEmailContextMock.mockReset();
    submitTimesheetMock.mockReset();
    sendAdminAutoSubmitNoticeMessageMock.mockReset();
    sendFinalNoticeMessageMock.mockReset();
    sendReminderMessageMock.mockReset();
    sendSubmissionConfirmationMessageMock.mockReset();
    safeWriteAuditLogMock.mockReset();

    getSystemConfigurationMock.mockResolvedValue({
      notifyAdminOnAutoSubmit: false,
      supportContactEmail: "support@janaagraha.org",
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    safeWriteAuditLogMock.mockResolvedValue(undefined);
  });

  it("targets the labelled month at the 25th IST cutoff and auto-submits complete drafts", async () => {
    const reference = new Date("2026-05-25T00:00:00+05:30");
    const timesheet = buildTimesheet();
    ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock.mockResolvedValue([timesheet]);
    getTimesheetEmailContextMock.mockResolvedValue(buildEmailContext());
    submitTimesheetMock.mockResolvedValue({
      totalHoursRecorded: 16,
      totalMinutesRecorded: 960,
      breakdownHtml: "<table></table>",
    });

    const summary = await runAutoSubmitJob(reference);

    expect(ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock).toHaveBeenCalledWith(
      reference,
    );
    expect(submitTimesheetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timesheetId: "timesheet-1",
        method: "auto",
        reference,
      }),
    );
    expect(summary).toMatchObject({
      evaluatedTimesheets: 1,
      autoSubmittedCount: 1,
      frozenCount: 0,
      finalNoticesSent: 1,
    });
  });

  it("freezes incomplete drafts at the 25th IST cutoff", async () => {
    const reference = new Date("2026-05-25T00:00:00+05:30");
    const timesheet = buildTimesheet();
    ensurePreviousMonthTimesheetsForAllTimesheetOwnersMock.mockResolvedValue([timesheet]);
    getTimesheetEmailContextMock.mockResolvedValue(
      buildEmailContext({ totalMinutes: 480, assignedMinutes: 960 }),
    );
    prismaMock.timesheet.update.mockResolvedValue({
      id: "timesheet-1",
      userId: "user-1",
    });

    const summary = await runAutoSubmitJob(reference);

    expect(prismaMock.timesheet.update).toHaveBeenCalledWith({
      where: { id: "timesheet-1" },
      data: {
        status: "FROZEN",
        frozenAt: reference,
      },
    });
    expect(submitTimesheetMock).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      evaluatedTimesheets: 1,
      autoSubmittedCount: 0,
      frozenCount: 1,
      finalNoticesSent: 1,
    });
  });

  it("rejects runs outside the exact 25th IST midnight window", async () => {
    await expect(runAutoSubmitJob(new Date("2026-05-25T00:01:00+05:30"))).rejects
      .toMatchObject({
        code: "INVALID_RUN_WINDOW",
        message: "Auto-submit may only run at 12:00 AM IST on the 25th.",
      });
  });
});
