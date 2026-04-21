const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    timesheet: {
      findMany: vi.fn(),
    },
    editRequest: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import {
  getAdminOperationalOversight,
  getComplianceReport,
  getEditRequestReport,
  getHoursUtilizationReport,
} from "@/services/report-service";

describe("report service", () => {
  beforeEach(() => {
    prismaMock.timesheet.findMany.mockReset();
    prismaMock.editRequest.findMany.mockReset();
  });

  it("exposes manual versus auto-generated entry origin in the hours utilization report", async () => {
    prismaMock.timesheet.findMany
      .mockResolvedValueOnce([
        {
          monthKey: "2026-03",
          assignedMinutes: 960,
          user: {
            name: "Ravi Director",
            role: "PROGRAM_HEAD",
          },
          entries: [
            {
              minutes: 480,
              workDate: new Date("2026-03-03T00:00:00.000Z"),
              createdVia: "DAY",
              lastEditedVia: "DAY",
              project: {
                name: "Water Program",
              },
            },
            {
              minutes: 240,
              workDate: new Date("2026-03-04T00:00:00.000Z"),
              createdVia: "MONTH",
              lastEditedVia: "WEEK",
              project: {
                name: "Water Program",
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          monthKey: "2026-03",
          entries: [{ minutes: 720 }],
        },
      ]);

    const report = await getHoursUtilizationReport("2026-03");

    expect(report.entryOriginSummary).toEqual([
      {
        entryType: "Manual Entry",
        totalHours: 8,
        rowCount: 1,
      },
      {
        entryType: "Auto Generated",
        totalHours: 4,
        rowCount: 1,
      },
    ]);
    expect(report.entryDetails).toEqual([
      expect.objectContaining({
        directorName: "Ravi Director",
        hours: 8,
        createdVia: "DAY",
        lastEditedVia: "DAY",
        entryType: "Manual Entry",
      }),
      expect.objectContaining({
        directorName: "Ravi Director",
        hours: 4,
        createdVia: "MONTH",
        lastEditedVia: "WEEK",
        entryType: "Auto Generated",
      }),
    ]);
  });

  it("uses assigned minutes when calculating compliance completion percentages", async () => {
    prismaMock.timesheet.findMany
      .mockResolvedValueOnce([
        {
          monthKey: "2026-03",
          status: "DRAFT",
          submittedAt: null,
          assignedMinutes: 960,
          user: {
            name: "Asha Director",
            role: "PROGRAM_HEAD",
          },
          entries: [
            {
              minutes: 720,
              project: {
                name: "Road Safety",
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          monthKey: "2026-03",
          status: "DRAFT",
          submittedAt: null,
        },
      ]);

    const report = await getComplianceReport("2026-03");

    expect(report.pendingByDirector).toEqual([
      {
        directorName: "Asha Director",
        status: "DRAFT",
        completionPercentage: 75,
      },
    ]);
  });

  it("builds the edit request report from director and associate director requests only", async () => {
    prismaMock.editRequest.findMany.mockResolvedValue([
      {
        status: "APPROVED",
        requestedAt: new Date("2026-03-01T04:30:00.000Z"),
        reviewedAt: new Date("2026-03-02T04:30:00.000Z"),
        requestedBy: {
          name: "Ravi Director",
          role: "PROGRAM_HEAD",
        },
        timesheet: {
          monthKey: "2026-02",
          assignedMinutes: 600,
          entries: [{ minutes: 300 }],
        },
      },
      {
        status: "REJECTED",
        requestedAt: new Date("2026-03-03T04:30:00.000Z"),
        reviewedAt: new Date("2026-03-03T10:30:00.000Z"),
        requestedBy: {
          name: "Asha Associate Director",
          role: "ASSOCIATE_DIRECTOR",
        },
        timesheet: {
          monthKey: "2026-01",
          assignedMinutes: 0,
          entries: [],
        },
      },
      {
        status: "EXPIRED",
        requestedAt: new Date("2026-03-04T04:30:00.000Z"),
        reviewedAt: null,
        requestedBy: {
          name: "Meera Director",
          role: "PROGRAM_HEAD",
        },
        timesheet: {
          monthKey: "2025-12",
          assignedMinutes: 480,
          entries: [{ minutes: 240 }],
        },
      },
    ]);

    const report = await getEditRequestReport();

    expect(prismaMock.editRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          requestedBy: {
            role: {
              in: ["PROGRAM_HEAD", "ASSOCIATE_DIRECTOR"],
            },
          },
        },
      }),
    );
    expect(report.summary).toEqual({
      totalRequests: 3,
      approvedCount: 1,
      rejectedCount: 1,
      expiredCount: 1,
      approvalRate: 33.33,
      rejectionRate: 33.33,
      averageResponseHours: 15,
    });
    expect(report.detailedRows).toEqual([
      expect.objectContaining({
        requesterName: "Ravi Director",
        status: "APPROVED",
        monthLabel: "February 2026",
        completionPercentage: 50,
      }),
      expect.objectContaining({
        requesterName: "Asha Associate Director",
        status: "REJECTED",
        monthLabel: "January 2026",
        completionPercentage: 0,
      }),
      expect.objectContaining({
        requesterName: "Meera Director",
        status: "EXPIRED",
        monthLabel: "December 2025",
        completionPercentage: 50,
      }),
    ]);
  });

  it("computes admin operational oversight from real-time timesheet and edit-request data", async () => {
    prismaMock.timesheet.findMany
      .mockResolvedValueOnce([
        { monthKey: "2026-03" },
        { monthKey: "2026-02" },
      ])
      .mockResolvedValueOnce([
        {
          monthKey: "2026-02",
          status: "SUBMITTED",
          submittedAt: new Date("2026-03-05T18:29:59.000Z"),
        },
        {
          monthKey: "2026-02",
          status: "AUTO_SUBMITTED",
          submittedAt: new Date("2026-03-05T18:30:00.000Z"),
        },
        {
          monthKey: "2026-02",
          status: "DRAFT",
          submittedAt: null,
        },
        {
          monthKey: "2026-02",
          status: "REJECTED",
          submittedAt: null,
        },
      ]);
    prismaMock.editRequest.findMany.mockResolvedValue([
      {
        status: "PENDING",
        requestedAt: new Date("2026-03-06T04:30:00.000Z"),
        reviewedAt: null,
      },
      {
        status: "APPROVED",
        requestedAt: new Date("2026-03-01T04:30:00.000Z"),
        reviewedAt: new Date("2026-03-02T04:30:00.000Z"),
      },
      {
        status: "REJECTED",
        requestedAt: new Date("2026-03-03T04:30:00.000Z"),
        reviewedAt: new Date("2026-03-03T10:30:00.000Z"),
      },
      {
        status: "EXPIRED",
        requestedAt: new Date("2026-03-04T04:30:00.000Z"),
        reviewedAt: null,
      },
    ]);

    const overview = await getAdminOperationalOversight({
      monthKey: "2026-02",
      editRequestStatus: "REJECTED",
    });

    expect(overview.selectedMonthKey).toBe("2026-02");
    expect(overview.selectedMonthLabel).toBe("February 2026");
    expect(overview.availableMonths).toEqual([
      {
        monthKey: "2026-03",
        monthLabel: "March 2026",
      },
      {
        monthKey: "2026-02",
        monthLabel: "February 2026",
      },
    ]);
    expect(overview.summary).toEqual({
      onTimeSubmissions: 1,
      pendingTimesheets: 2,
      averageResponseHours: 15,
    });
    expect(overview.editRequests).toEqual({
      selectedStatus: "REJECTED",
      count: 1,
      countsByStatus: {
        total: 4,
        pending: 1,
        approved: 1,
        rejected: 1,
        expired: 1,
      },
    });
  });
});
