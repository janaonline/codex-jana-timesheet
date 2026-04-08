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
  getComplianceReport,
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
          entries: [
            { minutes: 720 },
          ],
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
});
