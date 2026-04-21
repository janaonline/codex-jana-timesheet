import {
  NON_SUBMITTED_TIMESHEET_STATUSES,
  SUBMITTED_TIMESHEET_STATUSES,
  TIMESHEET_OWNER_ROLES,
  type EditRequestMetricFilter,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  getMonthLabel,
  getOnTimeSubmissionCutoff,
  getPreviousMonthKey,
} from "@/lib/time";
import { average, percentage } from "@/lib/utils";
import { minutesToHours } from "@/lib/timesheet-calculations";

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
  entryOriginSummary: Array<{
    entryType: "Manual Entry" | "Auto Generated";
    totalHours: number;
    rowCount: number;
  }>;
  entryDetails: Array<{
    directorName: string;
    date: string;
    subProgramName: string;
    hours: number;
    createdVia: string;
    lastEditedVia: string;
    entryType: "Manual Entry" | "Auto Generated";
  }>;
};

export type EditRequestReport = {
  summary: {
    totalRequests: number;
    approvedCount: number;
    rejectedCount: number;
    expiredCount: number;
    approvalRate: number;
    rejectionRate: number;
    averageResponseHours: number;
  };
  detailedRows: Array<{
    requesterName: string;
    requestedAt: string;
    status: string;
    monthKey: string;
    monthLabel: string;
    completionPercentage: number;
    reviewedAt: string | null;
    responseHours: number | null;
  }>;
};

export type AdminOperationalOversight = {
  selectedMonthKey: string | null;
  selectedMonthLabel: string;
  availableMonths: Array<{
    monthKey: string;
    monthLabel: string;
  }>;
  summary: {
    onTimeSubmissions: number;
    pendingTimesheets: number;
    averageResponseHours: number;
  };
  editRequests: {
    selectedStatus: EditRequestMetricFilter;
    count: number;
    countsByStatus: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      expired: number;
    };
  };
};

function buildTimesheetOwnerRoleWhere() {
  return {
    role: {
      in: [...TIMESHEET_OWNER_ROLES],
    },
  };
}

function buildRequestResponseHours(requestedAt: Date, reviewedAt: Date | null) {
  if (!reviewedAt) {
    return null;
  }

  return Number(
    ((reviewedAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60)).toFixed(2),
  );
}

function calculateCompletionPercentage(timesheet: {
  assignedMinutes: number;
  entries: Array<{ minutes: number }>;
}) {
  const totalLoggedMinutes = timesheet.entries.reduce(
    (sum, entry) => sum + entry.minutes,
    0,
  );

  return percentage(totalLoggedMinutes, timesheet.assignedMinutes);
}

async function getTimesheetsForMonth(monthKey: string) {
  return prisma.timesheet.findMany({
    where: {
      monthKey,
      user: buildTimesheetOwnerRoleWhere(),
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

function entryTypeForOrigin(
  createdVia: string,
): "Manual Entry" | "Auto Generated" {
  return createdVia === "DAY" ? "Manual Entry" : "Auto Generated";
}

export async function getComplianceReport(monthKey = getPreviousMonthKey(new Date())) {
  const timesheets = await getTimesheetsForMonth(monthKey);
  const cutoffDate = getOnTimeSubmissionCutoff(monthKey);

  const onTimeSubmissions = timesheets.filter((timesheet) => {
    return (
      SUBMITTED_TIMESHEET_STATUSES.includes(
        timesheet.status as (typeof SUBMITTED_TIMESHEET_STATUSES)[number],
      ) &&
      timesheet.submittedAt &&
      timesheet.submittedAt <= cutoffDate
    );
  }).length;

  const pending = timesheets.filter((timesheet) =>
    NON_SUBMITTED_TIMESHEET_STATUSES.includes(
      timesheet.status as (typeof NON_SUBMITTED_TIMESHEET_STATUSES)[number],
    ),
  );

  const historicalTimesheets = await prisma.timesheet.findMany({
    where: {
      user: buildTimesheetOwnerRoleWhere(),
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
      autoSubmitFailureCount: timesheets.filter((timesheet) =>
        ["FROZEN", "EDIT_REQUESTED", "EDIT_APPROVED", "REJECTED"].includes(
          timesheet.status,
        ),
      ).length,
    },
    pendingByDirector: pending.map((timesheet) => ({
      directorName: timesheet.user.name,
      status: timesheet.status,
      completionPercentage: calculateCompletionPercentage(timesheet),
    })),
    historicalTrend: Object.entries(grouped)
      .slice(0, 6)
      .map(([trendMonthKey, values]) => {
        const trendCutoff = getOnTimeSubmissionCutoff(trendMonthKey);
        const onTimeCount = values.filter(
          (value) =>
            SUBMITTED_TIMESHEET_STATUSES.includes(
              value.status as (typeof SUBMITTED_TIMESHEET_STATUSES)[number],
            ) &&
            value.submittedAt &&
            value.submittedAt <= trendCutoff,
        ).length;

        return {
          monthLabel: getMonthLabel(trendMonthKey),
          onTimePercentage: percentage(onTimeCount, values.length),
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
      minutesToHours(
        timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0),
      ).toFixed(2),
    ),
  }));

  const projectHours = timesheets.flatMap((timesheet) =>
    timesheet.entries.map((entry) => ({
      projectName: entry.project.name,
      hours: minutesToHours(entry.minutes),
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
      user: buildTimesheetOwnerRoleWhere(),
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
      const hours = minutesToHours(
        timesheet.entries.reduce((sum, entry) => sum + entry.minutes, 0),
      );
      accumulator[timesheet.monthKey] = Number(
        ((accumulator[timesheet.monthKey] ?? 0) + hours).toFixed(2),
      );
      return accumulator;
    },
    {},
  );

  const entryDetails = timesheets.flatMap((timesheet) =>
    timesheet.entries.map((entry) => ({
      directorName: timesheet.user.name,
      date: entry.workDate.toISOString(),
      subProgramName: entry.project.name,
      hours: minutesToHours(entry.minutes),
      createdVia: entry.createdVia,
      lastEditedVia: entry.lastEditedVia,
      entryType: entryTypeForOrigin(entry.createdVia),
    })),
  );

  const entryOriginBuckets = entryDetails.reduce<
    Record<
      string,
      {
        entryType: "Manual Entry" | "Auto Generated";
        totalHours: number;
        rowCount: number;
      }
    >
  >((accumulator, entry) => {
    accumulator[entry.entryType] ??= {
      entryType: entry.entryType,
      totalHours: 0,
      rowCount: 0,
    };
    accumulator[entry.entryType].totalHours = Number(
      (accumulator[entry.entryType].totalHours + entry.hours).toFixed(2),
    );
    accumulator[entry.entryType].rowCount += 1;
    return accumulator;
  }, {});

  const entryOriginSummary = ([
    "Manual Entry",
    "Auto Generated",
  ] as const).map((entryType) => ({
    entryType,
    totalHours: entryOriginBuckets[entryType]?.totalHours ?? 0,
    rowCount: entryOriginBuckets[entryType]?.rowCount ?? 0,
  }));

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
    entryOriginSummary,
    entryDetails,
  } satisfies HoursUtilizationReport;
}

export async function getEditRequestReport() {
  const requests = await prisma.editRequest.findMany({
    where: {
      requestedBy: buildTimesheetOwnerRoleWhere(),
    },
    include: {
      requestedBy: true,
      timesheet: {
        include: {
          entries: true,
        },
      },
    },
    orderBy: {
      requestedAt: "desc",
    },
  });

  const approvedCount = requests.filter((request) => request.status === "APPROVED").length;
  const rejectedCount = requests.filter((request) => request.status === "REJECTED").length;
  const expiredCount = requests.filter((request) => request.status === "EXPIRED").length;

  const detailedRows = requests.map((request) => ({
    requesterName: request.requestedBy.name,
    requestedAt: request.requestedAt.toISOString(),
    status: request.status,
    monthKey: request.timesheet.monthKey,
    monthLabel: getMonthLabel(request.timesheet.monthKey),
    completionPercentage: calculateCompletionPercentage(request.timesheet),
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    responseHours: buildRequestResponseHours(request.requestedAt, request.reviewedAt),
  }));

  const responseHours = detailedRows
    .map((row) => row.responseHours)
    .filter((value): value is number => value !== null);

  return {
    summary: {
      totalRequests: requests.length,
      approvedCount,
      rejectedCount,
      expiredCount,
      approvalRate: percentage(approvedCount, requests.length),
      rejectionRate: percentage(rejectedCount, requests.length),
      averageResponseHours: Number(average(responseHours).toFixed(2)),
    },
    detailedRows,
  } satisfies EditRequestReport;
}

export async function getAdminOperationalOversight(params?: {
  monthKey?: string | null;
  editRequestStatus?: EditRequestMetricFilter;
}) {
  const selectedMonthKey = params?.monthKey ?? null;
  const selectedEditRequestStatus = params?.editRequestStatus ?? "ALL";

  const [availableMonths, timesheets, requests] = await Promise.all([
    prisma.timesheet.findMany({
      where: {
        user: buildTimesheetOwnerRoleWhere(),
      },
      select: {
        monthKey: true,
        monthStart: true,
      },
      orderBy: {
        monthStart: "desc",
      },
    }),
    prisma.timesheet.findMany({
      where: {
        user: buildTimesheetOwnerRoleWhere(),
        ...(selectedMonthKey ? { monthKey: selectedMonthKey } : {}),
      },
      select: {
        monthKey: true,
        status: true,
        submittedAt: true,
      },
    }),
    prisma.editRequest.findMany({
      where: {
        requestedBy: buildTimesheetOwnerRoleWhere(),
        ...(selectedMonthKey ? { timesheet: { monthKey: selectedMonthKey } } : {}),
      },
      select: {
        status: true,
        requestedAt: true,
        reviewedAt: true,
      },
    }),
  ]);

  const countsByStatus = {
    total: requests.length,
    pending: requests.filter((request) => request.status === "PENDING").length,
    approved: requests.filter((request) => request.status === "APPROVED").length,
    rejected: requests.filter((request) => request.status === "REJECTED").length,
    expired: requests.filter((request) => request.status === "EXPIRED").length,
  };

  const selectedCount =
    selectedEditRequestStatus === "ALL"
      ? countsByStatus.total
      : requests.filter((request) => request.status === selectedEditRequestStatus).length;

  const averageResponseHours = Number(
    average(
      requests
        .map((request) =>
          buildRequestResponseHours(request.requestedAt, request.reviewedAt),
        )
        .filter((value): value is number => value !== null),
    ).toFixed(2),
  );

  return {
    selectedMonthKey,
    selectedMonthLabel: selectedMonthKey ? getMonthLabel(selectedMonthKey) : "Overall",
    availableMonths: availableMonths
      .filter(
        (item, index, items) =>
          items.findIndex((candidate) => candidate.monthKey === item.monthKey) === index,
      )
      .map((item) => ({
        monthKey: item.monthKey,
        monthLabel: getMonthLabel(item.monthKey),
      })),
    summary: {
      onTimeSubmissions: timesheets.filter(
        (timesheet) =>
          SUBMITTED_TIMESHEET_STATUSES.includes(
            timesheet.status as (typeof SUBMITTED_TIMESHEET_STATUSES)[number],
          ) &&
          timesheet.submittedAt &&
          timesheet.submittedAt <= getOnTimeSubmissionCutoff(timesheet.monthKey),
      ).length,
      pendingTimesheets: timesheets.filter((timesheet) =>
        NON_SUBMITTED_TIMESHEET_STATUSES.includes(
          timesheet.status as (typeof NON_SUBMITTED_TIMESHEET_STATUSES)[number],
        ),
      ).length,
      averageResponseHours,
    },
    editRequests: {
      selectedStatus: selectedEditRequestStatus,
      count: selectedCount,
      countsByStatus,
    },
  } satisfies AdminOperationalOversight;
}
