import { Prisma, type EntryOrigin, type UserRole } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  calculateAssignedHours,
  distributeMinutesEvenly,
  listWeekdaysForWeekInMonth,
  minutesToHours,
  normalizeHoursInputToMinutes,
  validateDayStateInput,
  validateTimesheetInput,
  type CalendarDay,
  type DraftEntryInput,
  type TimesheetDayStateInput,
} from "@/lib/timesheet-calculations";
import {
  formatDisplayDate,
  getDeadlineMetadata,
  getMonthKey,
  getMonthLabel,
  getMonthStart,
  getPreviousMonthKey,
  isCurrentMonth,
  isPreviousMonth,
} from "@/lib/time";
import {
  canEditTimesheet,
  canRequestEdit,
  canSubmitTimesheet,
  getTimesheetViewAvailability,
  shouldExpireEditWindow,
} from "@/lib/workflow-rules";
import { safeWriteAuditLog } from "@/services/audit-service";
import { getSystemConfiguration } from "@/services/configuration-service";

const timesheetInclude = Prisma.validator<Prisma.TimesheetInclude>()({
  user: true,
  entries: {
    include: {
      project: true,
    },
    orderBy: [
      { workDate: "asc" },
      { createdAt: "asc" },
    ],
  },
  dayStates: {
    orderBy: {
      workDate: "asc",
    },
  },
  editRequests: {
    orderBy: {
      requestedAt: "desc",
    },
    include: {
      requestedBy: true,
      reviewedBy: true,
    },
  },
});

type TimesheetRecord = Prisma.TimesheetGetPayload<{
  include: typeof timesheetInclude;
}>;

type RawEntryInput = {
  id?: string;
  workDate: string;
  projectId: string;
  hours: number;
  description?: string | null;
};

type Actor = {
  userId: string;
  role: UserRole;
};

type CapacityContext = Awaited<ReturnType<typeof getCapacityContext>>;

export type TimesheetEntryView = {
  id: string;
  workDate: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  minutes: number;
  hours: number;
  description: string;
  createdVia: EntryOrigin;
  lastEditedVia: EntryOrigin;
  entryType: "Manual Entry" | "Auto Generated";
};

export type TimesheetView = {
  id: string;
  userId: string;
  ownerName: string;
  ownerEmail: string;
  monthKey: string;
  monthLabel: string;
  status: TimesheetRecord["status"];
  leaveDays: number;
  workingDaysCount: number;
  assignedMinutes: number;
  assignedHours: number;
  totalMinutes: number;
  totalHours: number;
  completionPercentage: number;
  remainingMinutes: number;
  remainingHours: number;
  isExactlyComplete: boolean;
  isEditable: boolean;
  canSubmit: boolean;
  canRequestEdit: boolean;
  viewAvailability: {
    day: boolean;
    week: boolean;
    month: boolean;
  };
  version: number;
  autoSubmitted: boolean;
  submittedAt: string | null;
  frozenAt: string | null;
  editWindowClosesAt: string | null;
  rejectionReason: string | null;
  deadlines: {
    submissionDeadlineDate: string;
    autoSubmitDate: string;
  };
  entries: TimesheetEntryView[];
  dayStates: TimesheetDayStateInput[];
  calendarDays: Array<
    CalendarDay & {
      baseCapacityHours: number;
      capacityHours: number;
    }
  >;
  requestHistory: Array<{
    id: string;
    status: string;
    reason: string;
    decisionReason: string | null;
    requestedAt: string;
    reviewedAt: string | null;
    requestedByName: string;
    reviewedByName: string | null;
  }>;
};

export type DashboardData = {
  currentTimesheet: TimesheetView;
  previousTimesheet: TimesheetView;
  history: Array<{
    id: string;
    monthLabel: string;
    status: string;
    completionPercentage: number;
    submittedAt: string | null;
  }>;
  upcomingDeadlines: Array<{
    label: string;
    date: string;
  }>;
  allocationBreakdown: Array<{
    projectName: string;
    hours: number;
    percentage: number;
  }>;
};

function dateToIsoDate(date: Date) {
  return formatInTimeZone(date, "Asia/Kolkata", "yyyy-MM-dd");
}

function toWorkDate(date: string) {
  return new Date(`${date}T00:00:00+05:30`);
}

function resolveEntryMinutes(entry: { minutes: number; hours: number }) {
  if (entry.minutes > 0) {
    return entry.minutes;
  }

  const normalized = normalizeHoursInputToMinutes(entry.hours);
  if (normalized.ok) {
    return normalized.minutes;
  }

  return Math.max(0, Math.round(entry.hours * 60));
}

function toStoredDayStates(timesheet: TimesheetRecord) {
  return timesheet.dayStates.map((state) => ({
    workDate: dateToIsoDate(state.workDate),
    leaveType: state.leaveType,
    isPersonalNonWorkingDay: state.isPersonalNonWorkingDay,
  }));
}

async function getCapacityContext(timesheet: TimesheetRecord) {
  const config = await getSystemConfiguration();
  const summary = calculateAssignedHours({
    monthKey: timesheet.monthKey,
    joinDate: timesheet.user.joinDate,
    exitDate: timesheet.user.exitDate,
    holidays: config.holidayCalendar,
    dayStates: toStoredDayStates(timesheet),
    legacyLeaveDays: timesheet.leaveDays,
  });

  return {
    config,
    summary,
  };
}

function serializeTimesheet(
  timesheet: TimesheetRecord,
  capacityContext: CapacityContext,
  reference = new Date(),
): TimesheetView {
  const totalMinutes = timesheet.entries.reduce(
    (sum, entry) => sum + resolveEntryMinutes(entry),
    0,
  );
  const assignedMinutes = capacityContext.summary.assignedMinutes;
  const totalHours = minutesToHours(totalMinutes);
  const completionPercentage =
    assignedMinutes <= 0
      ? 0
      : Number(((totalMinutes / assignedMinutes) * 100).toFixed(2));
  const remainingMinutes = Math.max(0, assignedMinutes - totalMinutes);
  const isExactlyComplete =
    assignedMinutes > 0 && totalMinutes === assignedMinutes;
  const isEditable = canEditTimesheet({
    status: timesheet.status,
    monthKey: timesheet.monthKey,
    reference,
    editWindowClosesAt: timesheet.editWindowClosesAt,
  });

  return {
    id: timesheet.id,
    userId: timesheet.userId,
    ownerName: timesheet.user.name,
    ownerEmail: timesheet.user.email,
    monthKey: timesheet.monthKey,
    monthLabel: getMonthLabel(timesheet.monthKey),
    status: timesheet.status,
    leaveDays: capacityContext.summary.leaveDays,
    workingDaysCount: capacityContext.summary.workingDaysCount,
    assignedMinutes,
    assignedHours: capacityContext.summary.assignedHours,
    totalMinutes,
    totalHours,
    completionPercentage,
    remainingMinutes,
    remainingHours: minutesToHours(remainingMinutes),
    isExactlyComplete,
    isEditable,
    canSubmit: canSubmitTimesheet({
      status: timesheet.status,
      monthKey: timesheet.monthKey,
      reference,
      isExactlyComplete,
      editWindowClosesAt: timesheet.editWindowClosesAt,
    }),
    canRequestEdit: canRequestEdit({
      status: timesheet.status,
      monthKey: timesheet.monthKey,
      reference,
    }),
    viewAvailability: getTimesheetViewAvailability({
      status: timesheet.status,
      monthKey: timesheet.monthKey,
      reference,
      editWindowClosesAt: timesheet.editWindowClosesAt,
    }),
    version: timesheet.version,
    autoSubmitted: timesheet.autoSubmitted,
    submittedAt: timesheet.submittedAt?.toISOString() ?? null,
    frozenAt: timesheet.frozenAt?.toISOString() ?? null,
    editWindowClosesAt: timesheet.editWindowClosesAt?.toISOString() ?? null,
    rejectionReason: timesheet.rejectionReason,
    deadlines: getDeadlineMetadata(timesheet.monthKey),
    entries: timesheet.entries.map((entry) => {
      const minutes = resolveEntryMinutes(entry);
      return {
        id: entry.id,
        workDate: dateToIsoDate(entry.workDate),
        projectId: entry.projectId,
        projectCode: entry.project.code,
        projectName: entry.project.name,
        minutes,
        hours: minutesToHours(minutes),
        description: entry.description ?? "",
        createdVia: entry.createdVia,
        lastEditedVia: entry.lastEditedVia,
        entryType:
          entry.createdVia === "DAY" ? "Manual Entry" : "Auto Generated",
      } satisfies TimesheetEntryView;
    }),
    dayStates: capacityContext.summary.effectiveDayStates,
    calendarDays: capacityContext.summary.calendarDays.map((day) => ({
      ...day,
      baseCapacityHours: minutesToHours(day.baseCapacityMinutes),
      capacityHours: minutesToHours(day.capacityMinutes),
    })),
    requestHistory: timesheet.editRequests.map((request) => ({
      id: request.id,
      status: request.status,
      reason: request.reason,
      decisionReason: request.decisionReason,
      requestedAt: request.requestedAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      requestedByName: request.requestedBy.name,
      reviewedByName: request.reviewedBy?.name ?? null,
    })),
  };
}

function assertTimesheetAccess(timesheet: TimesheetRecord, actor: Actor) {
  if (actor.role === "PROGRAM_HEAD" && timesheet.userId !== actor.userId) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "You can only access your own timesheets.",
    );
  }
}

async function getUserOrThrow(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError("NOT_FOUND", 404, "User not found.");
  }

  return user;
}

async function getTimesheetRecordOrThrow(timesheetId: string) {
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: timesheetInclude,
  });

  if (!timesheet) {
    throw new AppError("NOT_FOUND", 404, "Timesheet not found.");
  }

  return timesheet;
}

async function buildTimesheetView(timesheet: TimesheetRecord, reference = new Date()) {
  const capacityContext = await getCapacityContext(timesheet);
  return serializeTimesheet(timesheet, capacityContext, reference);
}

async function refreshTimesheetDerivedFields(
  userId: string,
  monthKey: string,
  params: {
    dayStates: TimesheetDayStateInput[];
    legacyLeaveDays: number;
  },
) {
  const [user, config] = await Promise.all([
    getUserOrThrow(userId),
    getSystemConfiguration(),
  ]);

  return calculateAssignedHours({
    monthKey,
    joinDate: user.joinDate,
    exitDate: user.exitDate,
    holidays: config.holidayCalendar,
    dayStates: params.dayStates,
    legacyLeaveDays: params.legacyLeaveDays,
  });
}

async function createOrRefreshTimesheet(userId: string, monthKey: string, reference: Date) {
  const user = await getUserOrThrow(userId);
  const summary = await refreshTimesheetDerivedFields(userId, monthKey, {
    dayStates: [],
    legacyLeaveDays: 0,
  });
  const status =
    isPreviousMonth(monthKey, reference) &&
    reference >= new Date(`${getDeadlineMetadata(monthKey).autoSubmitDate}T00:00:00+05:30`)
      ? "FROZEN"
      : "DRAFT";

  return prisma.timesheet.upsert({
    where: {
      userId_monthKey: {
        userId,
        monthKey,
      },
    },
    create: {
      userId: user.id,
      monthKey,
      monthStart: getMonthStart(monthKey),
      leaveDays: summary.leaveDays,
      workingDaysCount: summary.workingDaysCount,
      assignedMinutes: summary.assignedMinutes,
      assignedHours: summary.assignedHours,
      status,
      frozenAt: status === "FROZEN" ? reference : null,
    },
    update: {
      leaveDays: summary.leaveDays,
      workingDaysCount: summary.workingDaysCount,
      assignedMinutes: summary.assignedMinutes,
      assignedHours: summary.assignedHours,
    },
    include: timesheetInclude,
  });
}

async function getAvailableProjects() {
  return prisma.project.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

function buildBreakdownHtml(timesheet: TimesheetRecord) {
  const grouped = timesheet.entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.project.name] = Number(
      (
        (accumulator[entry.project.name] ?? 0) + minutesToHours(resolveEntryMinutes(entry))
      ).toFixed(2),
    );
    return accumulator;
  }, {});

  return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb;">Sub-program</th>
          <th style="text-align: right; padding: 8px; border-bottom: 1px solid #e5e7eb;">Hours</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(grouped)
          .map(
            ([name, hours]) => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #f3f4f6;">${name}</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #f3f4f6;">${hours}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function normalizeRawEntries(entries: RawEntryInput[]) {
  const errors: string[] = [];

  const normalized = entries.map((entry, index) => {
    const normalizedHours = normalizeHoursInputToMinutes(entry.hours);
    if (!normalizedHours.ok) {
      errors.push(`Entry ${index + 1}: ${normalizedHours.error}`);
      return {
        id: entry.id,
        workDate: entry.workDate,
        projectId: entry.projectId,
        minutes: 0,
        description: entry.description,
      } satisfies DraftEntryInput;
    }

    return {
      id: entry.id,
      workDate: entry.workDate,
      projectId: entry.projectId,
      minutes: normalizedHours.minutes,
      description: entry.description,
    } satisfies DraftEntryInput;
  });

  if (errors.length > 0) {
    throw new AppError(
      "TIMESHEET_VALIDATION_FAILED",
      400,
      "Timesheet validation failed.",
      errors,
    );
  }

  return normalized;
}

function getDateRangeMetadata(dates: string[]) {
  if (!dates.length) {
    return {
      startDate: null,
      endDate: null,
    };
  }

  const sorted = [...dates].sort();
  return {
    startDate: sorted[0],
    endDate: sorted[sorted.length - 1],
  };
}

async function reconcileEntries(
  tx: Prisma.TransactionClient,
  timesheet: TimesheetRecord,
  entries: DraftEntryInput[],
  mode: EntryOrigin,
) {
  const existingEntries = await tx.timesheetEntry.findMany({
    where: { timesheetId: timesheet.id },
    select: {
      id: true,
      projectId: true,
      workDate: true,
      minutes: true,
      hours: true,
      description: true,
      createdVia: true,
      lastEditedVia: true,
    },
  });

  const existingIds = new Map(existingEntries.map((entry) => [entry.id, entry]));
  const incomingIds = new Set(entries.map((entry) => entry.id).filter(Boolean) as string[]);
  const projectIds = [...new Set(entries.map((entry) => entry.projectId))];
  const projectCount = await tx.project.count({
    where: {
      id: { in: projectIds },
      isActive: true,
    },
  });

  if (projectIds.length !== projectCount) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "One or more selected sub-programs are invalid or inactive.",
    );
  }

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  for (const entry of entries) {
    if (!entry.workDate.startsWith(timesheet.monthKey)) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Entry dates must belong to the selected month.",
      );
    }

    const existing = entry.id ? existingIds.get(entry.id) : null;
    if (existing) {
      const nextDescription = entry.description?.trim() || null;
      const existingWorkDate = dateToIsoDate(existing.workDate);
      const hasChanges =
        existing.projectId !== entry.projectId ||
        existingWorkDate !== entry.workDate ||
        resolveEntryMinutes(existing) !== entry.minutes ||
        (existing.description ?? null) !== nextDescription;

      if (!hasChanges) {
        continue;
      }

      await tx.timesheetEntry.update({
        where: { id: existing.id },
        data: {
          projectId: entry.projectId,
          workDate: toWorkDate(entry.workDate),
          minutes: entry.minutes,
          hours: minutesToHours(entry.minutes),
          description: nextDescription,
          lastEditedVia: mode,
        },
      });
      updatedCount += 1;
      continue;
    }

    await tx.timesheetEntry.create({
      data: {
        timesheetId: timesheet.id,
        projectId: entry.projectId,
        workDate: toWorkDate(entry.workDate),
        minutes: entry.minutes,
        hours: minutesToHours(entry.minutes),
        description: entry.description?.trim() || null,
        createdVia: mode,
        lastEditedVia: mode,
      },
    });
    createdCount += 1;
  }

  const idsToDelete = existingEntries
    .map((entry) => entry.id)
    .filter((id) => !incomingIds.has(id));

  if (idsToDelete.length > 0) {
    const deleted = await tx.timesheetEntry.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });
    deletedCount = deleted.count;
  }

  return {
    createdCount,
    updatedCount,
    deletedCount,
  };
}

function getOverwriteCandidates(
  timesheet: TimesheetRecord,
  projectId: string,
  targetDates: string[],
) {
  const targetDateSet = new Set(targetDates);
  return timesheet.entries.filter(
    (entry) =>
      entry.projectId === projectId &&
      targetDateSet.has(dateToIsoDate(entry.workDate)),
  );
}

function buildOverwriteDetails(entries: TimesheetRecord["entries"]) {
  const overwriteDates = [...new Set(entries.map((entry) => dateToIsoDate(entry.workDate)))];
  return overwriteDates.map(
    (workDate) => `${workDate}: an existing row for the selected sub-program will be replaced.`,
  );
}

async function buildAllocationTargets(params: {
  timesheet: TimesheetRecord;
  targetDates: string[];
  replacingEntryIds: Set<string>;
}) {
  const capacityContext = await getCapacityContext(params.timesheet);
  const calendarDayMap = new Map(
    capacityContext.summary.calendarDays.map((day) => [day.workDate, day]),
  );
  const untouchedMinutesByDate = params.timesheet.entries.reduce<Record<string, number>>(
    (accumulator, entry) => {
      if (params.replacingEntryIds.has(entry.id)) {
        return accumulator;
      }

      const workDate = dateToIsoDate(entry.workDate);
      accumulator[workDate] = (accumulator[workDate] ?? 0) + resolveEntryMinutes(entry);
      return accumulator;
    },
    {},
  );

  const targets = params.targetDates.map((workDate) => {
    const calendarDay = calendarDayMap.get(workDate);
    const availableMinutes = Math.max(
      0,
      (calendarDay?.capacityMinutes ?? 0) - (untouchedMinutesByDate[workDate] ?? 0),
    );

    return {
      workDate,
      calendarDay,
      untouchedMinutes: untouchedMinutesByDate[workDate] ?? 0,
      availableMinutes,
    };
  });

  return {
    capacityContext,
    targets,
  };
}

async function applyGeneratedEntries(params: {
  timesheet: TimesheetRecord;
  actor: Actor;
  mode: EntryOrigin;
  version: number;
  projectId: string;
  totalHours: number;
  description: string;
  targetDates: string[];
  confirmOverwrite?: boolean;
  reference: Date;
}) {
  assertTimesheetAccess(params.timesheet, params.actor);

  if (
    !canEditTimesheet({
      status: params.timesheet.status,
      monthKey: params.timesheet.monthKey,
      reference: params.reference,
      editWindowClosesAt: params.timesheet.editWindowClosesAt,
    })
  ) {
    throw new AppError("TIMESHEET_LOCKED", 400, "This timesheet is currently locked.");
  }

  if (params.version !== params.timesheet.version) {
    throw new AppError(
      "VERSION_CONFLICT",
      400,
      "A newer draft exists. Please refresh to avoid overwriting changes.",
      { latestVersion: params.timesheet.version },
    );
  }

  const viewAvailability = getTimesheetViewAvailability({
    status: params.timesheet.status,
    monthKey: params.timesheet.monthKey,
    reference: params.reference,
    editWindowClosesAt: params.timesheet.editWindowClosesAt,
  });

  if (
    (params.mode === "WEEK" || params.mode === "MONTH") &&
    !viewAvailability[params.mode.toLowerCase() as "week" | "month"]
  ) {
    throw new AppError(
      "VIEW_NOT_AVAILABLE",
      400,
      "Week and Month allocation are only available on editable current-month drafts.",
    );
  }

  const normalizedTotal = normalizeHoursInputToMinutes(params.totalHours);
  if (!normalizedTotal.ok) {
    throw new AppError("VALIDATION_ERROR", 400, normalizedTotal.error);
  }

  const overwriteCandidates = getOverwriteCandidates(
    params.timesheet,
    params.projectId,
    params.targetDates,
  );

  if (overwriteCandidates.length > 0 && !params.confirmOverwrite) {
    throw new AppError(
      "OVERWRITE_CONFIRMATION_REQUIRED",
      409,
      "Existing rows for this sub-program will be replaced on the selected dates.",
      buildOverwriteDetails(overwriteCandidates),
    );
  }

  const replacingEntryIds = new Set(overwriteCandidates.map((entry) => entry.id));
  const allocationTargets = await buildAllocationTargets({
    timesheet: params.timesheet,
    targetDates: params.targetDates,
    replacingEntryIds,
  });
  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      isActive: true,
    },
  });

  if (!project) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "One or more selected sub-programs are invalid or inactive.",
    );
  }

  const distribution = distributeMinutesEvenly({
    totalMinutes: normalizedTotal.minutes,
    targets: allocationTargets.targets.map((target) => ({
      workDate: target.workDate,
      capacityMinutes: target.availableMinutes,
    })),
  });

  const newEntries = distribution.map((entry) => ({
    workDate: entry.workDate,
    projectId: params.projectId,
    minutes: entry.minutes,
    description: params.description,
  })) satisfies DraftEntryInput[];

  const remainingEntries = params.timesheet.entries
    .filter((entry) => !replacingEntryIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectId: entry.projectId,
      minutes: resolveEntryMinutes(entry),
      description: entry.description,
      createdVia: entry.createdVia,
      lastEditedVia: entry.lastEditedVia,
    })) satisfies DraftEntryInput[];

  const validation = validateTimesheetInput({
    entries: [...remainingEntries, ...newEntries],
    assignedMinutes: allocationTargets.capacityContext.summary.assignedMinutes,
    calendarDays: allocationTargets.capacityContext.summary.calendarDays,
    mode: "draft",
  });

  if (validation.errors.length > 0) {
    throw new AppError(
      "TIMESHEET_CAPACITY_CONFLICT",
      400,
      "The requested hours could not be applied to the selected dates.",
      validation.errors,
    );
  }

  const updatedTimesheet = await prisma.$transaction(async (tx) => {
    if (replacingEntryIds.size > 0) {
      await tx.timesheetEntry.deleteMany({
        where: {
          id: {
            in: [...replacingEntryIds],
          },
        },
      });
    }

    await Promise.all(
      newEntries.map((entry) =>
        tx.timesheetEntry.create({
          data: {
            timesheetId: params.timesheet.id,
            projectId: entry.projectId,
            workDate: toWorkDate(entry.workDate),
            minutes: entry.minutes,
            hours: minutesToHours(entry.minutes),
            description: entry.description?.trim() || null,
            createdVia: params.mode,
            lastEditedVia: params.mode,
          },
        }),
      ),
    );

    await tx.timesheet.update({
      where: { id: params.timesheet.id },
      data: {
        leaveDays: allocationTargets.capacityContext.summary.leaveDays,
        workingDaysCount: allocationTargets.capacityContext.summary.workingDaysCount,
        assignedMinutes: allocationTargets.capacityContext.summary.assignedMinutes,
        assignedHours: allocationTargets.capacityContext.summary.assignedHours,
        rejectionReason: null,
        version: {
          increment: 1,
        },
      },
    });

    const dateRange = getDateRangeMetadata(distribution.map((entry) => entry.workDate));
    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: params.timesheet.userId,
        timesheetId: params.timesheet.id,
        action:
          params.mode === "WEEK"
            ? "TIMESHEET_WEEK_APPLIED"
            : "TIMESHEET_MONTH_APPLIED",
        entityType: "TIMESHEET",
        entityId: params.timesheet.id,
        metadata: {
          mode: params.mode,
          projectId: params.projectId,
          projectName: project.name,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          overwriteConfirmed: Boolean(params.confirmOverwrite),
          rowsCreated: newEntries.length,
          rowsDeleted: replacingEntryIds.size,
          rowsUpdated: 0,
        },
      },
      tx as unknown as typeof prisma,
    );

    return tx.timesheet.findUniqueOrThrow({
      where: { id: params.timesheet.id },
      include: timesheetInclude,
    });
  });

  return {
    timesheet: await buildTimesheetView(updatedTimesheet, params.reference),
    overwriteCandidates: overwriteCandidates.map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectName: entry.project.name,
      hours: minutesToHours(resolveEntryMinutes(entry)),
    })),
  };
}

export async function ensureWindowTimesheets(userId: string, reference = new Date()) {
  const currentMonthKey = getMonthKey(reference);
  const previousMonthKey = getPreviousMonthKey(reference);

  const [currentTimesheet, previousTimesheet] = await Promise.all([
    createOrRefreshTimesheet(userId, currentMonthKey, reference),
    createOrRefreshTimesheet(userId, previousMonthKey, reference),
  ]);

  const [currentView, previousView] = await Promise.all([
    buildTimesheetView(currentTimesheet, reference),
    buildTimesheetView(previousTimesheet, reference),
  ]);

  return {
    currentTimesheet: currentView,
    previousTimesheet: previousView,
  };
}

export async function createTimesheetForUser(
  userId: string,
  monthKey: string,
  reference = new Date(),
) {
  const allowedMonthKeys = [getMonthKey(reference), getPreviousMonthKey(reference)];
  if (!allowedMonthKeys.includes(monthKey)) {
    throw new AppError(
      "INVALID_MONTH",
      400,
      "Only the current month and previous month can be created in the MVP.",
    );
  }

  const record = await createOrRefreshTimesheet(userId, monthKey, reference);
  return buildTimesheetView(record, reference);
}

export async function listTimesheetsForUser(userId: string, reference = new Date()) {
  await ensureWindowTimesheets(userId, reference);
  const records = await prisma.timesheet.findMany({
    where: { userId },
    include: timesheetInclude,
    orderBy: { monthStart: "desc" },
    take: 12,
  });

  return Promise.all(records.map((timesheet) => buildTimesheetView(timesheet, reference)));
}

export async function getTimesheetForActor(
  timesheetId: string,
  actor: Actor,
  reference = new Date(),
) {
  const timesheet = await getTimesheetRecordOrThrow(timesheetId);
  assertTimesheetAccess(timesheet, actor);

  const [projects, windowTimesheets] = await Promise.all([
    getAvailableProjects(),
    ensureWindowTimesheets(timesheet.userId, reference),
  ]);
  const timesheetView =
    timesheet.id === windowTimesheets.currentTimesheet.id
      ? windowTimesheets.currentTimesheet
      : timesheet.id === windowTimesheets.previousTimesheet.id
        ? windowTimesheets.previousTimesheet
        : await buildTimesheetView(timesheet, reference);
  const selectableWindowTimesheets = [
    windowTimesheets.currentTimesheet,
    windowTimesheets.previousTimesheet,
  ].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index,
  );

  return {
    timesheet: timesheetView,
    availableProjects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
    })),
    windowTimesheets: selectableWindowTimesheets
      .map((item) => ({
        id: item.id,
        monthKey: item.monthKey,
        monthLabel: item.monthLabel,
      })),
  };
}

export async function saveDraftTimesheet(params: {
  timesheetId: string;
  actor: Actor;
  version: number;
  entries: RawEntryInput[];
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);
  assertTimesheetAccess(existing, params.actor);

  if (
    !canEditTimesheet({
      status: existing.status,
      monthKey: existing.monthKey,
      reference,
      editWindowClosesAt: existing.editWindowClosesAt,
    })
  ) {
    throw new AppError("TIMESHEET_LOCKED", 400, "This timesheet is currently locked.");
  }

  if (params.version !== existing.version) {
    throw new AppError(
      "VERSION_CONFLICT",
      400,
      "A newer draft exists. Please refresh to avoid overwriting changes.",
      { latestVersion: existing.version },
    );
  }

  const normalizedEntries = normalizeRawEntries(params.entries);
  const capacitySummary = await refreshTimesheetDerivedFields(
    existing.userId,
    existing.monthKey,
    {
      dayStates: toStoredDayStates(existing),
      legacyLeaveDays: existing.leaveDays,
    },
  );
  const validation = validateTimesheetInput({
    entries: normalizedEntries,
    assignedMinutes: capacitySummary.assignedMinutes,
    calendarDays: capacitySummary.calendarDays,
    mode: "draft",
  });

  if (validation.errors.length > 0) {
    throw new AppError(
      "TIMESHEET_VALIDATION_FAILED",
      400,
      "Draft save failed.",
      validation.errors,
    );
  }

  const updatedTimesheet = await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: existing.id },
      data: {
        leaveDays: capacitySummary.leaveDays,
        workingDaysCount: capacitySummary.workingDaysCount,
        assignedMinutes: capacitySummary.assignedMinutes,
        assignedHours: capacitySummary.assignedHours,
        version: {
          increment: 1,
        },
        rejectionReason: null,
      },
    });

    const changeSummary = await reconcileEntries(tx, existing, normalizedEntries, "DAY");
    const affectedDates = normalizedEntries.map((entry) => entry.workDate);
    const dateRange = getDateRangeMetadata(affectedDates);

    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: existing.userId,
        timesheetId: existing.id,
        action: "TIMESHEET_DRAFT_SAVED",
        entityType: "TIMESHEET",
        entityId: existing.id,
        metadata: {
          mode: "DAY",
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          rowsCreated: changeSummary.createdCount,
          rowsUpdated: changeSummary.updatedCount,
          rowsDeleted: changeSummary.deletedCount,
          overwriteConfirmed: false,
          totalHours: validation.totalHours,
        },
      },
      tx as unknown as typeof prisma,
    );

    return tx.timesheet.findUniqueOrThrow({
      where: { id: existing.id },
      include: timesheetInclude,
    });
  });

  return {
    timesheet: await buildTimesheetView(updatedTimesheet, reference),
    breakdownHtml: buildBreakdownHtml(updatedTimesheet),
  };
}

export async function updateTimesheetCalendar(params: {
  timesheetId: string;
  actor: Actor;
  version: number;
  updates: TimesheetDayStateInput[];
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);
  assertTimesheetAccess(existing, params.actor);

  if (
    !canEditTimesheet({
      status: existing.status,
      monthKey: existing.monthKey,
      reference,
      editWindowClosesAt: existing.editWindowClosesAt,
    })
  ) {
    throw new AppError("TIMESHEET_LOCKED", 400, "This timesheet is currently locked.");
  }

  if (params.version !== existing.version) {
    throw new AppError(
      "VERSION_CONFLICT",
      400,
      "A newer draft exists. Please refresh to avoid overwriting changes.",
      { latestVersion: existing.version },
    );
  }

  const currentCapacityContext = await getCapacityContext(existing);
  const calendarDayMap = new Map(
    currentCapacityContext.summary.calendarDays.map((day) => [day.workDate, day]),
  );
  const nextStateMap = new Map(
    currentCapacityContext.summary.effectiveDayStates.map((state) => [state.workDate, state]),
  );

  for (const update of params.updates) {
    if (!update.workDate.startsWith(existing.monthKey)) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Calendar updates must belong to the selected month.",
      );
    }

    const calendarDay = calendarDayMap.get(update.workDate);
    if (!calendarDay) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Calendar updates must belong to the selected month.",
      );
    }

    validateDayStateInput(calendarDay, update);

    if (update.leaveType === "NONE" && !update.isPersonalNonWorkingDay) {
      nextStateMap.delete(update.workDate);
      continue;
    }

    nextStateMap.set(update.workDate, update);
  }

  const nextStates = [...nextStateMap.values()].sort((left, right) =>
    left.workDate.localeCompare(right.workDate),
  );
  const nextSummary = await refreshTimesheetDerivedFields(existing.userId, existing.monthKey, {
    dayStates: nextStates,
    legacyLeaveDays: 0,
  });
  const currentEntries = existing.entries.map((entry) => ({
    id: entry.id,
    workDate: dateToIsoDate(entry.workDate),
    projectId: entry.projectId,
    minutes: resolveEntryMinutes(entry),
    description: entry.description,
    createdVia: entry.createdVia,
    lastEditedVia: entry.lastEditedVia,
  })) satisfies DraftEntryInput[];
  const validation = validateTimesheetInput({
    entries: currentEntries,
    assignedMinutes: nextSummary.assignedMinutes,
    calendarDays: nextSummary.calendarDays,
    mode: "draft",
  });

  if (validation.errors.length > 0) {
    throw new AppError(
      "TIMESHEET_CAPACITY_CONFLICT",
      400,
      "The selected date state conflicts with existing entries.",
      validation.errors,
    );
  }

  const updatedTimesheet = await prisma.$transaction(async (tx) => {
    const existingDayStates = await tx.timesheetDayState.findMany({
      where: {
        timesheetId: existing.id,
      },
      select: {
        id: true,
        workDate: true,
      },
    });
    const existingDayStateIds = new Map(
      existingDayStates.map((state) => [dateToIsoDate(state.workDate), state.id]),
    );
    const nextDateSet = new Set(nextStates.map((state) => state.workDate));

    for (const [workDate, id] of existingDayStateIds.entries()) {
      if (!nextDateSet.has(workDate)) {
        await tx.timesheetDayState.delete({
          where: { id },
        });
      }
    }

    for (const state of nextStates) {
      const existingId = existingDayStateIds.get(state.workDate);
      if (existingId) {
        await tx.timesheetDayState.update({
          where: { id: existingId },
          data: {
            leaveType: state.leaveType,
            isPersonalNonWorkingDay: state.isPersonalNonWorkingDay,
          },
        });
        continue;
      }

      await tx.timesheetDayState.create({
        data: {
          timesheetId: existing.id,
          workDate: toWorkDate(state.workDate),
          leaveType: state.leaveType,
          isPersonalNonWorkingDay: state.isPersonalNonWorkingDay,
        },
      });
    }

    await tx.timesheet.update({
      where: { id: existing.id },
      data: {
        leaveDays: nextSummary.leaveDays,
        workingDaysCount: nextSummary.workingDaysCount,
        assignedMinutes: nextSummary.assignedMinutes,
        assignedHours: nextSummary.assignedHours,
        rejectionReason: null,
        version: {
          increment: 1,
        },
      },
    });

    const dateRange = getDateRangeMetadata(params.updates.map((update) => update.workDate));
    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: existing.userId,
        timesheetId: existing.id,
        action: "TIMESHEET_CALENDAR_UPDATED",
        entityType: "TIMESHEET",
        entityId: existing.id,
        metadata: {
          mode: "DAY",
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          rowsCreated: 0,
          rowsUpdated: params.updates.length,
          rowsDeleted: 0,
          overwriteConfirmed: false,
        },
      },
      tx as unknown as typeof prisma,
    );

    return tx.timesheet.findUniqueOrThrow({
      where: { id: existing.id },
      include: timesheetInclude,
    });
  });

  return {
    timesheet: await buildTimesheetView(updatedTimesheet, reference),
  };
}

export async function applyWeekAllocation(params: {
  timesheetId: string;
  actor: Actor;
  version: number;
  projectId: string;
  totalHours: number;
  description: string;
  weekStartDate: string;
  confirmOverwrite?: boolean;
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);

  return applyGeneratedEntries({
    timesheet: existing,
    actor: params.actor,
    mode: "WEEK",
    version: params.version,
    projectId: params.projectId,
    totalHours: params.totalHours,
    description: params.description,
    targetDates: listWeekdaysForWeekInMonth(params.weekStartDate, existing.monthKey),
    confirmOverwrite: params.confirmOverwrite,
    reference,
  });
}

export async function applyMonthAllocation(params: {
  timesheetId: string;
  actor: Actor;
  version: number;
  projectId: string;
  totalHours: number;
  description: string;
  confirmOverwrite?: boolean;
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);
  const capacityContext = await getCapacityContext(existing);

  return applyGeneratedEntries({
    timesheet: existing,
    actor: params.actor,
    mode: "MONTH",
    version: params.version,
    projectId: params.projectId,
    totalHours: params.totalHours,
    description: params.description,
    targetDates: capacityContext.summary.calendarDays.map((day) => day.workDate),
    confirmOverwrite: params.confirmOverwrite,
    reference,
  });
}

export async function submitTimesheet(params: {
  timesheetId: string;
  actor: Actor;
  method: "manual" | "auto";
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);
  assertTimesheetAccess(existing, params.actor);
  const capacitySummary = await refreshTimesheetDerivedFields(existing.userId, existing.monthKey, {
    dayStates: toStoredDayStates(existing),
    legacyLeaveDays: existing.leaveDays,
  });
  const validation = validateTimesheetInput({
    entries: existing.entries.map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectId: entry.projectId,
      minutes: resolveEntryMinutes(entry),
      description: entry.description,
      createdVia: entry.createdVia,
      lastEditedVia: entry.lastEditedVia,
    })),
    assignedMinutes: capacitySummary.assignedMinutes,
    calendarDays: capacitySummary.calendarDays,
    mode: "submit",
  });

  if (validation.errors.length > 0) {
    throw new AppError(
      "TIMESHEET_VALIDATION_FAILED",
      400,
      "Submission failed.",
      validation.errors,
    );
  }

  if (
    !canSubmitTimesheet({
      status: existing.status,
      monthKey: existing.monthKey,
      reference,
      isExactlyComplete: validation.isExactlyComplete,
      editWindowClosesAt: existing.editWindowClosesAt,
    })
  ) {
    throw new AppError(
      "SUBMISSION_NOT_ALLOWED",
      400,
      "Manual submission is not allowed for this timesheet right now.",
    );
  }

  const nextStatus =
    params.method === "auto"
      ? "AUTO_SUBMITTED"
      : existing.status === "EDIT_APPROVED"
        ? "RESUBMITTED"
        : "SUBMITTED";

  const submitted = await prisma.$transaction(async (tx) => {
    await tx.timesheet.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        autoSubmitted: params.method === "auto",
        submittedAt: reference,
        frozenAt: reference,
        editWindowClosesAt: null,
        leaveDays: capacitySummary.leaveDays,
        workingDaysCount: capacitySummary.workingDaysCount,
        assignedMinutes: capacitySummary.assignedMinutes,
        assignedHours: capacitySummary.assignedHours,
      },
    });

    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: existing.userId,
        timesheetId: existing.id,
        action: params.method === "auto" ? "TIMESHEET_AUTO_SUBMITTED" : "TIMESHEET_SUBMITTED",
        entityType: "TIMESHEET",
        entityId: existing.id,
        metadata: {
          submissionMethod: params.method,
          totalHours: validation.totalHours,
          totalMinutes: validation.totalMinutes,
        },
      },
      tx as unknown as typeof prisma,
    );

    return tx.timesheet.findUniqueOrThrow({
      where: { id: existing.id },
      include: timesheetInclude,
    });
  });

  return {
    timesheet: await buildTimesheetView(submitted, reference),
    totalHoursRecorded: validation.totalHours,
    totalMinutesRecorded: validation.totalMinutes,
    breakdownHtml: buildBreakdownHtml(submitted),
  };
}

export async function requestEdit(params: {
  timesheetId: string;
  actor: Actor;
  reason: string;
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const existing = await getTimesheetRecordOrThrow(params.timesheetId);
  assertTimesheetAccess(existing, params.actor);

  if (
    !canRequestEdit({
      status: existing.status,
      monthKey: existing.monthKey,
      reference,
    })
  ) {
    throw new AppError(
      "EDIT_REQUEST_NOT_ALLOWED",
      400,
      "Edit requests are only available for previous-month frozen or submitted timesheets.",
    );
  }

  const pendingRequest = existing.editRequests.find((request) => request.status === "PENDING");
  if (pendingRequest) {
    throw new AppError(
      "EDIT_REQUEST_ALREADY_PENDING",
      400,
      "An edit request is already pending for this timesheet.",
    );
  }

  const approvers = await prisma.user.findMany({
    where: existing.user.approverUserId
      ? { id: existing.user.approverUserId }
      : { role: "ADMIN", isActive: true },
    orderBy: { name: "asc" },
  });

  const createdRequest = await prisma.$transaction(async (tx) => {
    const request = await tx.editRequest.create({
      data: {
        timesheetId: existing.id,
        requestedById: params.actor.userId,
        reason: params.reason,
        status: "PENDING",
      },
    });

    await tx.timesheet.update({
      where: { id: existing.id },
      data: {
        status: "EDIT_REQUESTED",
        rejectionReason: null,
      },
    });

    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: existing.userId,
        timesheetId: existing.id,
        action: "EDIT_REQUEST_CREATED",
        entityType: "EDIT_REQUEST",
        entityId: request.id,
        metadata: {
          reason: params.reason,
        },
      },
      tx as unknown as typeof prisma,
    );

    return request;
  });

  return {
    request: createdRequest,
    approvers,
    timesheet: await buildTimesheetView(
      await getTimesheetRecordOrThrow(existing.id),
      reference,
    ),
  };
}

export async function listPendingEditRequests() {
  return prisma.editRequest.findMany({
    where: { status: "PENDING" },
    include: {
      requestedBy: true,
      timesheet: {
        include: {
          user: true,
        },
      },
    },
    orderBy: { requestedAt: "asc" },
  });
}

export async function approveEditRequest(params: {
  editRequestId: string;
  approverUserId: string;
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const request = await prisma.editRequest.findUnique({
    where: { id: params.editRequestId },
    include: {
      requestedBy: true,
      timesheet: {
        include: timesheetInclude,
      },
    },
  });

  if (!request) {
    throw new AppError("NOT_FOUND", 404, "Edit request not found.");
  }

  if (request.status !== "PENDING") {
    throw new AppError("INVALID_STATE", 400, "Edit request is no longer pending.");
  }

  const config = await getSystemConfiguration();
  const { addWorkingDaysFromNextBusinessDay } = await import("@/lib/time");
  const editableUntil = addWorkingDaysFromNextBusinessDay(
    reference,
    3,
    config.holidayCalendar,
  );

  const updatedRequest = await prisma.$transaction(async (tx) => {
    const approval = await tx.editRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedById: params.approverUserId,
        reviewedAt: reference,
        editableUntil,
      },
      include: {
        requestedBy: true,
        timesheet: {
          include: timesheetInclude,
        },
      },
    });

    await tx.timesheet.update({
      where: { id: request.timesheetId },
      data: {
        status: "EDIT_APPROVED",
        editApprovedAt: reference,
        editWindowClosesAt: editableUntil,
        rejectionReason: null,
      },
    });

    await safeWriteAuditLog(
      {
        actorUserId: params.approverUserId,
        subjectUserId: request.timesheet.userId,
        timesheetId: request.timesheetId,
        action: "EDIT_REQUEST_APPROVED",
        entityType: "EDIT_REQUEST",
        entityId: request.id,
        metadata: {
          editableUntil: editableUntil.toISOString(),
        },
      },
      tx as unknown as typeof prisma,
    );

    return approval;
  });

  return {
    request: updatedRequest,
    timesheet: await buildTimesheetView(
      await getTimesheetRecordOrThrow(request.timesheetId),
      reference,
    ),
  };
}

export async function rejectEditRequest(params: {
  editRequestId: string;
  approverUserId: string;
  reason: string;
  reference?: Date;
}) {
  const reference = params.reference ?? new Date();
  const request = await prisma.editRequest.findUnique({
    where: { id: params.editRequestId },
    include: {
      requestedBy: true,
      timesheet: {
        include: timesheetInclude,
      },
    },
  });

  if (!request) {
    throw new AppError("NOT_FOUND", 404, "Edit request not found.");
  }

  if (request.status !== "PENDING") {
    throw new AppError("INVALID_STATE", 400, "Edit request is no longer pending.");
  }

  const rejection = await prisma.$transaction(async (tx) => {
    const updated = await tx.editRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        reviewedById: params.approverUserId,
        reviewedAt: reference,
        decisionReason: params.reason,
      },
      include: {
        requestedBy: true,
        timesheet: {
          include: timesheetInclude,
        },
      },
    });

    await tx.timesheet.update({
      where: { id: request.timesheetId },
      data: {
        status: "REJECTED",
        rejectionReason: params.reason,
      },
    });

    await safeWriteAuditLog(
      {
        actorUserId: params.approverUserId,
        subjectUserId: request.timesheet.userId,
        timesheetId: request.timesheetId,
        action: "EDIT_REQUEST_REJECTED",
        entityType: "EDIT_REQUEST",
        entityId: request.id,
        metadata: {
          rejectionReason: params.reason,
        },
      },
      tx as unknown as typeof prisma,
    );

    return updated;
  });

  return {
    request: rejection,
    timesheet: await buildTimesheetView(
      await getTimesheetRecordOrThrow(request.timesheetId),
      reference,
    ),
  };
}

export async function expireApprovedEditWindows(reference = new Date()) {
  const expiringTimesheets = await prisma.timesheet.findMany({
    where: {
      status: "EDIT_APPROVED",
    },
    include: timesheetInclude,
  });

  let expiredCount = 0;

  for (const timesheet of expiringTimesheets) {
    if (
      !shouldExpireEditWindow({
        status: timesheet.status,
        editWindowClosesAt: timesheet.editWindowClosesAt,
        reference,
      })
    ) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.timesheet.update({
        where: { id: timesheet.id },
        data: {
          status: "FROZEN",
          frozenAt: reference,
        },
      });

      await tx.editRequest.updateMany({
        where: {
          timesheetId: timesheet.id,
          status: "APPROVED",
        },
        data: {
          status: "EXPIRED",
        },
      });

      await safeWriteAuditLog(
        {
          subjectUserId: timesheet.userId,
          timesheetId: timesheet.id,
          action: "EDIT_WINDOW_EXPIRED",
          entityType: "TIMESHEET",
          entityId: timesheet.id,
        },
        tx as unknown as typeof prisma,
      );
    });

    expiredCount += 1;
  }

  return { expiredCount };
}

export async function getDashboardData(userId: string, reference = new Date()) {
  const currentWindow = await ensureWindowTimesheets(userId, reference);
  const historyRecords = await prisma.timesheet.findMany({
    where: { userId },
    include: timesheetInclude,
    orderBy: { monthStart: "desc" },
    take: 12,
  });
  const viewCache = new Map<string, TimesheetView>([
    [currentWindow.currentTimesheet.id, currentWindow.currentTimesheet],
    [currentWindow.previousTimesheet.id, currentWindow.previousTimesheet],
  ]);
  const history = await Promise.all(
    historyRecords.map(async (timesheet) => {
      const cachedView = viewCache.get(timesheet.id);

      if (cachedView) {
        return cachedView;
      }

      const nextView = await buildTimesheetView(timesheet, reference);
      viewCache.set(nextView.id, nextView);
      return nextView;
    }),
  );

  const allocationSource = currentWindow.currentTimesheet.entries.length
    ? currentWindow.currentTimesheet.entries
    : currentWindow.previousTimesheet.entries;

  const grouped = allocationSource.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.projectName] = Number(
      ((accumulator[entry.projectName] ?? 0) + entry.hours).toFixed(2),
    );
    return accumulator;
  }, {});

  const totalAllocationHours = Object.values(grouped).reduce(
    (sum, hours) => sum + hours,
    0,
  );

  return {
    currentTimesheet: currentWindow.currentTimesheet,
    previousTimesheet: currentWindow.previousTimesheet,
    history: history.map((item) => ({
      id: item.id,
      monthLabel: item.monthLabel,
      status: item.status,
      completionPercentage: item.completionPercentage,
      submittedAt: item.submittedAt,
    })),
    upcomingDeadlines: [
      {
        label: "Current month submission deadline",
        date: formatDisplayDate(currentWindow.currentTimesheet.deadlines.submissionDeadlineDate),
      },
      {
        label: "Previous month auto-submit cutoff",
        date: formatDisplayDate(currentWindow.previousTimesheet.deadlines.autoSubmitDate),
      },
    ],
    allocationBreakdown: Object.entries(grouped).map(([projectName, hours]) => ({
      projectName,
      hours,
      percentage:
        totalAllocationHours > 0
          ? Number(((hours / totalAllocationHours) * 100).toFixed(2))
          : 0,
    })),
  } satisfies DashboardData;
}

export async function ensurePreviousMonthTimesheetsForAllProgramHeads(reference = new Date()) {
  const monthKey = getPreviousMonthKey(reference);
  const users = await prisma.user.findMany({
    where: {
      role: "PROGRAM_HEAD",
      isActive: true,
    },
  });

  const timesheets: TimesheetRecord[] = [];

  for (const user of users) {
    const timesheet = await createOrRefreshTimesheet(user.id, monthKey, reference);
    timesheets.push(timesheet);
  }

  return timesheets;
}

export async function getTimesheetEmailContext(timesheetId: string, reference = new Date()) {
  const timesheet = await getTimesheetRecordOrThrow(timesheetId);
  const view = await buildTimesheetView(timesheet, reference);

  return {
    timesheet,
    view,
    requestEditUrl: `${env.appBaseUrl}/timesheets/${timesheet.id}`,
    timesheetUrl: `${env.appBaseUrl}/timesheets/${timesheet.id}`,
    reviewUrl: `${env.appBaseUrl}/admin/edit-requests`,
    breakdownHtml: buildBreakdownHtml(timesheet),
  };
}

export function summarizeTimesheetForReporting(view: TimesheetView) {
  return {
    id: view.id,
    monthKey: view.monthKey,
    monthLabel: view.monthLabel,
    assignedMinutes: view.assignedMinutes,
    assignedHours: view.assignedHours,
    totalMinutes: view.totalMinutes,
    totalHours: view.totalHours,
    completionPercentage: view.completionPercentage,
    remainingHours: view.remainingHours,
    isCurrentMonth: isCurrentMonth(view.monthKey),
    isPreviousMonth: isPreviousMonth(view.monthKey),
  };
}
