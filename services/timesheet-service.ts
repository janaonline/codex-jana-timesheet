import { Prisma, type UserRole } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  calculateAssignedHours,
  sumRecordedHours,
  type DraftEntryInput,
  validateTimesheetInput,
} from "@/lib/timesheet-calculations";
import {
  addWorkingDaysFromNextBusinessDay,
  formatDisplayDate,
  getDeadlineMetadata,
  getMonthKey,
  getMonthLabel,
  getMonthStart,
  getPreviousMonthKey,
  isPreviousMonth,
} from "@/lib/time";
import {
  canEditTimesheet,
  canRequestEdit,
  canSubmitTimesheet,
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
  assignedHours: number;
  totalHours: number;
  completionPercentage: number;
  remainingHours: number;
  isExactlyComplete: boolean;
  isEditable: boolean;
  canSubmit: boolean;
  canRequestEdit: boolean;
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
  entries: Array<{
    id: string;
    workDate: string;
    projectId: string;
    projectCode: string;
    projectName: string;
    hours: number;
    description: string;
  }>;
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

type Actor = {
  userId: string;
  role: UserRole;
};

function dateToIsoDate(date: Date) {
  return formatInTimeZone(date, "Asia/Kolkata", "yyyy-MM-dd");
}

function toWorkDate(date: string) {
  return new Date(`${date}T00:00:00+05:30`);
}

function serializeTimesheet(timesheet: TimesheetRecord, reference = new Date()): TimesheetView {
  const totalHours = Number(sumRecordedHours(
    timesheet.entries.map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectId: entry.projectId,
      hours: entry.hours,
      description: entry.description,
    })),
  ).toFixed(2));
  const completionPercentage =
    timesheet.assignedHours <= 0
      ? 0
      : Number(((totalHours / timesheet.assignedHours) * 100).toFixed(2));
  const remainingHours = Math.max(
    0,
    Number((timesheet.assignedHours - totalHours).toFixed(2)),
  );
  const isExactlyComplete =
    timesheet.assignedHours > 0 &&
    Number(totalHours.toFixed(2)) === Number(timesheet.assignedHours.toFixed(2));

  return {
    id: timesheet.id,
    userId: timesheet.userId,
    ownerName: timesheet.user.name,
    ownerEmail: timesheet.user.email,
    monthKey: timesheet.monthKey,
    monthLabel: getMonthLabel(timesheet.monthKey),
    status: timesheet.status,
    leaveDays: timesheet.leaveDays,
    workingDaysCount: timesheet.workingDaysCount,
    assignedHours: timesheet.assignedHours,
    totalHours,
    completionPercentage,
    remainingHours,
    isExactlyComplete,
    isEditable: canEditTimesheet({
      status: timesheet.status,
      monthKey: timesheet.monthKey,
      reference,
      editWindowClosesAt: timesheet.editWindowClosesAt,
    }),
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
    version: timesheet.version,
    autoSubmitted: timesheet.autoSubmitted,
    submittedAt: timesheet.submittedAt?.toISOString() ?? null,
    frozenAt: timesheet.frozenAt?.toISOString() ?? null,
    editWindowClosesAt: timesheet.editWindowClosesAt?.toISOString() ?? null,
    rejectionReason: timesheet.rejectionReason,
    deadlines: getDeadlineMetadata(timesheet.monthKey),
    entries: timesheet.entries.map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectId: entry.projectId,
      projectCode: entry.project.code,
      projectName: entry.project.name,
      hours: entry.hours,
      description: entry.description ?? "",
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

async function refreshTimesheetDerivedFields(
  userId: string,
  monthKey: string,
  leaveDays: number,
) {
  const [user, config] = await Promise.all([
    getUserOrThrow(userId),
    getSystemConfiguration(),
  ]);

  return calculateAssignedHours({
    monthKey,
    leaveDays,
    joinDate: user.joinDate,
    exitDate: user.exitDate,
    holidays: config.holidayCalendar,
  });
}

async function createOrRefreshTimesheet(userId: string, monthKey: string, reference: Date) {
  const derived = await refreshTimesheetDerivedFields(userId, monthKey, 0);
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
      userId,
      monthKey,
      monthStart: getMonthStart(monthKey),
      leaveDays: 0,
      workingDaysCount: derived.workingDaysCount,
      assignedHours: derived.assignedHours,
      status,
      frozenAt: status === "FROZEN" ? reference : null,
    },
    update: {
      workingDaysCount: derived.workingDaysCount,
      assignedHours: derived.assignedHours,
    },
    include: timesheetInclude,
  });
}

async function reconcileEntries(
  tx: Prisma.TransactionClient,
  timesheetId: string,
  monthKey: string,
  entries: DraftEntryInput[],
) {
  const existingEntries = await tx.timesheetEntry.findMany({
    where: { timesheetId },
    select: { id: true },
  });

  const existingIds = new Set(existingEntries.map((entry) => entry.id));
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

  const entryOperations = entries.map((entry) => {
    if (!entry.workDate.startsWith(monthKey)) {
      throw new AppError(
        "VALIDATION_ERROR",
        400,
        "Entry dates must belong to the selected month.",
      );
    }

    if (entry.id && existingIds.has(entry.id)) {
      return tx.timesheetEntry.update({
        where: { id: entry.id },
        data: {
          projectId: entry.projectId,
          workDate: toWorkDate(entry.workDate),
          hours: entry.hours,
          description: entry.description?.trim() || null,
        },
      });
    }

    return tx.timesheetEntry.create({
      data: {
        timesheetId,
        projectId: entry.projectId,
        workDate: toWorkDate(entry.workDate),
        hours: entry.hours,
        description: entry.description?.trim() || null,
      },
    });
  });

  const idsToDelete = existingEntries
    .map((entry) => entry.id)
    .filter((id) => !incomingIds.has(id));

  if (idsToDelete.length) {
    await tx.timesheetEntry.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });
  }

  await Promise.all(entryOperations);
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
      ((accumulator[entry.project.name] ?? 0) + entry.hours).toFixed(2),
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

export async function ensureWindowTimesheets(userId: string, reference = new Date()) {
  const currentMonthKey = getMonthKey(reference);
  const previousMonthKey = getPreviousMonthKey(reference);

  const [currentTimesheet, previousTimesheet] = await Promise.all([
    createOrRefreshTimesheet(userId, currentMonthKey, reference),
    createOrRefreshTimesheet(userId, previousMonthKey, reference),
  ]);

  return {
    currentTimesheet: serializeTimesheet(currentTimesheet, reference),
    previousTimesheet: serializeTimesheet(previousTimesheet, reference),
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
  return serializeTimesheet(record, reference);
}

export async function listTimesheetsForUser(userId: string, reference = new Date()) {
  await ensureWindowTimesheets(userId, reference);
  const records = await prisma.timesheet.findMany({
    where: { userId },
    include: timesheetInclude,
    orderBy: { monthStart: "desc" },
    take: 12,
  });

  return records.map((timesheet) => serializeTimesheet(timesheet, reference));
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
    listTimesheetsForUser(timesheet.userId, reference),
  ]);

  return {
    timesheet: serializeTimesheet(timesheet, reference),
    availableProjects: projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
    })),
    windowTimesheets: windowTimesheets
      .filter((item) => [getMonthKey(reference), getPreviousMonthKey(reference)].includes(item.monthKey))
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
  leaveDays: number;
  version: number;
  entries: DraftEntryInput[];
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

  const derived = await refreshTimesheetDerivedFields(
    existing.userId,
    existing.monthKey,
    params.leaveDays,
  );
  const validation = validateTimesheetInput({
    entries: params.entries,
    leaveDays: params.leaveDays,
    assignedHours: derived.assignedHours,
    mode: "draft",
  });

  if (validation.errors.length) {
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
        leaveDays: params.leaveDays,
        workingDaysCount: derived.workingDaysCount,
        assignedHours: derived.assignedHours,
        version: {
          increment: 1,
        },
        rejectionReason: null,
      },
    });

    await reconcileEntries(tx, existing.id, existing.monthKey, params.entries);

    await safeWriteAuditLog(
      {
        actorUserId: params.actor.userId,
        subjectUserId: existing.userId,
        timesheetId: existing.id,
        action: "TIMESHEET_DRAFT_SAVED",
        entityType: "TIMESHEET",
        entityId: existing.id,
        metadata: {
          leaveDays: params.leaveDays,
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
    timesheet: serializeTimesheet(updatedTimesheet, reference),
    breakdownHtml: buildBreakdownHtml(updatedTimesheet),
  };
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

  const validation = validateTimesheetInput({
    entries: existing.entries.map((entry) => ({
      id: entry.id,
      workDate: dateToIsoDate(entry.workDate),
      projectId: entry.projectId,
      hours: entry.hours,
      description: entry.description,
    })),
    leaveDays: existing.leaveDays,
    assignedHours: existing.assignedHours,
    mode: "submit",
  });

  if (validation.errors.length) {
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
    timesheet: serializeTimesheet(submitted, reference),
    totalHoursRecorded: validation.totalHours,
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
    timesheet: serializeTimesheet(
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
    timesheet: serializeTimesheet(
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
    timesheet: serializeTimesheet(
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
  const [currentWindow, history] = await Promise.all([
    ensureWindowTimesheets(userId, reference),
    listTimesheetsForUser(userId, reference),
  ]);

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
  const view = serializeTimesheet(timesheet, reference);

  return {
    timesheet,
    view,
    requestEditUrl: `${env.appBaseUrl}/timesheets/${timesheet.id}`,
    timesheetUrl: `${env.appBaseUrl}/timesheets/${timesheet.id}`,
    reviewUrl: `${env.appBaseUrl}/admin/edit-requests`,
    breakdownHtml: buildBreakdownHtml(timesheet),
  };
}
