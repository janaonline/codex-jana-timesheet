import { prisma } from "@/lib/prisma";
import { getMonthLabel, getPreviousMonthKey } from "@/lib/time";
import { average } from "@/lib/utils";
import { getCutoffDate } from "@/lib/workflow-rules";

export type ComplianceReport = {
  monthKey: string;
  monthLabel: string;
  summary: {
    totalProgramHeads: number;
    onTimeSubmissions: number;
    pendingTimesheets: number;
    autoSubmitSuccessCount: number;
    autoSubmitFailureCount: number;
  };
  pendingByDirector: Array<{
    directorName: string;
    status: string;
    completionPercentage: number;
  }>;
  historicalTrend: Array<{
    monthLabel: string;
    onTimePercentage: number;
  }>;
};

export type HoursUtilizationReport = {
  monthKey: string;
  monthLabel: string;
  totalsByDirector: Array<{
    directorName: string;
    totalHours: number;
  }>;
  totalsBySubProgram: Array<{
    subProgramName: string;
    totalHours: number;
  }>;
  monthOverMonthTrend: Array<{
    monthLabel: string;
    totalHours: number;
  }>;
};

export type EditRequestReport = {
  summary: {
    totalRequests: number;
    approvalRate: number;
    rejectionRate: number;
    averageResponseHours: number;
  };
  commonReasons: Array<{
    reason: string;
    count: number;
  }>;
  requests: Array<{
    requesterName: string;
    monthLabel: string;
    status: string;
    requestedAt: string;
    reviewedAt: string | null;
    responseHours: number | null;
  }>;
};

async function getTimesheetsForMonth(monthKey: string) {
  return prisma.timesheet.findMany({
    where: {
      monthKey,
      user: {
        role: "PROGRAM_HEAD",
      },
    },
    include: {
      user: true,
      entries: {
        include: {
          project: true,
        },
      },
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });
}

export async function getComplianceReport(monthKey = getPreviousMonthKey(new Date())) {
  const timesheets = await getTimesheetsForMonth(monthKey);
  const cutoffDate = getCutoffDate(monthKey);
  const submittedStatuses = ["SUBMITTED", "AUTO_SUBMITTED", "RESUBMITTED"];

  const onTimeSubmissions = timesheets.filter((timesheet) => {
    return (
      submittedStatuses.includes(timesheet.status) &&
      timesheet.submittedAt &&
      timesheet.submittedAt <= cutoffDate
    );
  }).length;

  const pending = timesheets.filter(
    (timesheet) => !submittedStatuses.includes(timesheet.status),
  );

  const historicalTimesheets = await prisma.timesheet.findMany({
    where: {
      user: {
        role: "PROGRAM_HEAD",
      },
    },
    select: {
      monthKey: true,
      submittedAt: true,
      status: true,
    },
    orderBy: {
      monthStart: "desc",
    },
    take: 60,
  });

  const grouped = historicalTimesheets.reduce<Record<string, typeof historicalTimesheets>>(
    (accumulator, timesheet) => {
      accumulator[timesheet.monthKey] ??= [];
      accumulator[timesheet.monthKey].push(timesheet);
      return accumulator;
    },
    {},
  );

  return {
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    summary: {
      totalProgramHeads: timesheets.length,
      onTimeSubmissions,
      pendingTimesheets: pending.length,
      autoSubmitSuccessCount: timesheets.filter(
        (timesheet) => timesheet.status === "AUTO_SUBMITTED",
      ).length,
      autoSubmitFailureCount: timesheets.filter(
        (timesheet) =>
          ["FROZEN", "EDIT_REQUESTED", "EDIT_APPROVED", "REJECTED"].includes(
            timesheet.status,
          ),
      ).length,
    },
    pendingByDirector: pending.map((timesheet) => {
      const totalHours = timesheet.entries.reduce((sum, entry) => sum + entry.hours, 0);
      const completionPercentage =
        timesheet.assignedHours > 0
          ? Number(((totalHours / timesheet.assignedHours) * 100).toFixed(2))
          : 0;

      return {
        directorName: timesheet.user.name,
        status: timesheet.status,
        completionPercentage,
      };
    }),
    historicalTrend: Object.entries(grouped)
      .slice(0, 6)
      .map(([trendMonthKey, values]) => {
        const trendCutoff = getCutoffDate(trendMonthKey);
        const onTimeCount = values.filter(
          (value) =>
            submittedStatuses.includes(value.status) &&
            value.submittedAt &&
            value.submittedAt <= trendCutoff,
        ).length;

        return {
          monthLabel: getMonthLabel(trendMonthKey),
          onTimePercentage:
            values.length > 0
              ? Number(((onTimeCount / values.length) * 100).toFixed(2))
              : 0,
        };
      }),
  } satisfies ComplianceReport;
}

export async function getHoursUtilizationReport(
  monthKey = getPreviousMonthKey(new Date()),
) {
  const timesheets = await getTimesheetsForMonth(monthKey);

  const totalsByDirector = timesheets.map((timesheet) => ({
    directorName: timesheet.user.name,
    totalHours: Number(
      timesheet.entries.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2),
    ),
  }));

  const projectHours = timesheets.flatMap((timesheet) =>
    timesheet.entries.map((entry) => ({
      projectName: entry.project.name,
      hours: entry.hours,
    })),
  );

  const totalsBySubProgram = Object.entries(
    projectHours.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.projectName] = Number(
        ((accumulator[entry.projectName] ?? 0) + entry.hours).toFixed(2),
      );
      return accumulator;
    }, {}),
  ).map(([subProgramName, totalHours]) => ({
    subProgramName,
    totalHours,
  }));

  const recentTimesheets = await prisma.timesheet.findMany({
    where: {
      user: {
        role: "PROGRAM_HEAD",
      },
    },
    include: {
      entries: true,
    },
    orderBy: {
      monthStart: "desc",
    },
    take: 60,
  });

  const trendBuckets = recentTimesheets.reduce<Record<string, number>>(
    (accumulator, timesheet) => {
      const hours = timesheet.entries.reduce((sum, entry) => sum + entry.hours, 0);
      accumulator[timesheet.monthKey] = Number(
        ((accumulator[timesheet.monthKey] ?? 0) + hours).toFixed(2),
      );
      return accumulator;
    },
    {},
  );

  return {
    monthKey,
    monthLabel: getMonthLabel(monthKey),
    totalsByDirector,
    totalsBySubProgram,
    monthOverMonthTrend: Object.entries(trendBuckets)
      .slice(0, 6)
      .map(([trendMonthKey, totalHours]) => ({
        monthLabel: getMonthLabel(trendMonthKey),
        totalHours,
      })),
  } satisfies HoursUtilizationReport;
}

export async function getEditRequestReport() {
  const requests = await prisma.editRequest.findMany({
    include: {
      requestedBy: true,
      timesheet: true,
    },
    orderBy: {
      requestedAt: "desc",
    },
  });

  const responseHours = requests
    .filter((request) => request.reviewedAt)
    .map((request) => {
      return (
        (request.reviewedAt!.getTime() - request.requestedAt.getTime()) /
        (1000 * 60 * 60)
      );
    });

  const reasonCounts = requests.reduce<Record<string, number>>((accumulator, request) => {
    accumulator[request.reason] = (accumulator[request.reason] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    summary: {
      totalRequests: requests.length,
      approvalRate:
        requests.length > 0
          ? Number(
              (
                (requests.filter((request) => request.status === "APPROVED").length /
                  requests.length) *
                100
              ).toFixed(2),
            )
          : 0,
      rejectionRate:
        requests.length > 0
          ? Number(
              (
                (requests.filter((request) => request.status === "REJECTED").length /
                  requests.length) *
                100
              ).toFixed(2),
            )
          : 0,
      averageResponseHours: Number(average(responseHours).toFixed(2)),
    },
    commonReasons: Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    requests: requests.map((request) => ({
      requesterName: request.requestedBy.name,
      monthLabel: getMonthLabel(request.timesheet.monthKey),
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      responseHours: request.reviewedAt
        ? Number(
            (
              (request.reviewedAt.getTime() - request.requestedAt.getTime()) /
              (1000 * 60 * 60)
            ).toFixed(2),
          )
        : null,
    })),
  } satisfies EditRequestReport;
}
