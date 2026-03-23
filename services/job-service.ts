import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getDaysRemainingInMonth, getReminderRun, isExactAutoSubmitMoment } from "@/lib/time";
import {
  isEligibleForAutoSubmit,
  isEligibleForReminder,
} from "@/lib/workflow-rules";
import { getSystemConfiguration } from "@/services/configuration-service";
import {
  sendAdminAutoSubmitNoticeMessage,
  sendFinalNoticeMessage,
  sendReminderMessage,
  sendSubmissionConfirmationMessage,
} from "@/services/email-service";
import {
  ensurePreviousMonthTimesheetsForAllProgramHeads,
  ensureWindowTimesheets,
  expireApprovedEditWindows,
  getTimesheetEmailContext,
  submitTimesheet,
} from "@/services/timesheet-service";
import { safeWriteAuditLog } from "@/services/audit-service";

async function freezeIncompleteTimesheet(timesheetId: string, reference: Date) {
  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: "FROZEN",
      frozenAt: reference,
    },
  });

  await safeWriteAuditLog({
    subjectUserId: updated.userId,
    timesheetId: updated.id,
    action: "TIMESHEET_FROZEN_AT_CUTOFF",
    entityType: "TIMESHEET",
    entityId: updated.id,
  });

  return updated;
}

export async function runAutoSubmitJob(reference = new Date()) {
  if (!isExactAutoSubmitMoment(reference)) {
    throw new AppError(
      "INVALID_RUN_WINDOW",
      400,
      "Auto-submit may only run at 12:00 AM IST on the 5th.",
    );
  }

  const [config, timesheets, admins] = await Promise.all([
    getSystemConfiguration(),
    ensurePreviousMonthTimesheetsForAllProgramHeads(reference),
    prisma.user.findMany({
      where: {
        role: "ADMIN",
        isActive: true,
      },
    }),
  ]);

  let autoSubmittedCount = 0;
  let frozenCount = 0;
  let finalNoticesSent = 0;

  for (const timesheet of timesheets) {
    const emailContext = await getTimesheetEmailContext(timesheet.id, reference);
    const view = emailContext.view;

    if (
      isEligibleForAutoSubmit({
        status: view.status,
        assignedHours: view.assignedHours,
        totalHours: view.totalHours,
        monthKey: view.monthKey,
        reference,
      })
    ) {
      const submitted = await submitTimesheet({
        timesheetId: timesheet.id,
        actor: {
          userId: timesheet.userId,
          role: timesheet.user.role,
        },
        method: "auto",
        reference,
      });

      await sendSubmissionConfirmationMessage({
        recipient: view.ownerEmail,
        userName: view.ownerName,
        userId: view.userId,
        timesheetId: view.id,
        monthLabel: view.monthLabel,
        submissionTimestamp: reference.toISOString(),
        submissionMethod: "auto",
        totalHoursRecorded: submitted.totalHoursRecorded,
        breakdownHtml: submitted.breakdownHtml,
        requestEditUrl: emailContext.requestEditUrl,
      });

      if (config.notifyAdminOnAutoSubmit) {
        await Promise.all(
          admins.map((admin) =>
            sendAdminAutoSubmitNoticeMessage({
              recipient: admin.email,
              monthLabel: view.monthLabel,
              programHeadName: view.ownerName,
              totalHoursRecorded: submitted.totalHoursRecorded,
              timesheetId: view.id,
            }),
          ),
        );
      }

      await sendFinalNoticeMessage({
        recipient: view.ownerEmail,
        userName: view.ownerName,
        userId: view.userId,
        timesheetId: view.id,
        monthLabel: view.monthLabel,
        completionPercentage: 100,
        remainingHours: 0,
        autoSubmitted: true,
        requestEditUrl: emailContext.requestEditUrl,
        supportContactEmail: config.supportContactEmail,
      });

      autoSubmittedCount += 1;
      finalNoticesSent += 1;
      continue;
    }

    if (view.status === "DRAFT") {
      await freezeIncompleteTimesheet(view.id, reference);
      frozenCount += 1;

      await sendFinalNoticeMessage({
        recipient: view.ownerEmail,
        userName: view.ownerName,
        userId: view.userId,
        timesheetId: view.id,
        monthLabel: view.monthLabel,
        completionPercentage: view.completionPercentage,
        remainingHours: view.remainingHours,
        autoSubmitted: false,
        requestEditUrl: emailContext.requestEditUrl,
        supportContactEmail: config.supportContactEmail,
      });

      finalNoticesSent += 1;
    }
  }

  return {
    evaluatedTimesheets: timesheets.length,
    autoSubmittedCount,
    frozenCount,
    finalNoticesSent,
  };
}

export async function runReminderJob(reference = new Date()) {
  const schedule = getReminderRun(reference);

  if (!schedule || schedule.kind === "FINAL_NOTICE_5TH") {
    return {
      reminderKind: schedule?.kind ?? null,
      sentCount: 0,
      evaluatedTimesheets: 0,
    };
  }

  const config = await getSystemConfiguration();
  const users = await prisma.user.findMany({
    where: {
      role: "PROGRAM_HEAD",
      isActive: true,
    },
  });

  let evaluatedTimesheets = 0;
  let sentCount = 0;

  for (const user of users) {
    const windowTimesheets = await ensureWindowTimesheets(user.id, reference);
    const view =
      schedule.targetMonthKey === windowTimesheets.currentTimesheet.monthKey
        ? windowTimesheets.currentTimesheet
        : windowTimesheets.previousTimesheet;

    evaluatedTimesheets += 1;

    if (
      !isEligibleForReminder({
        kind: schedule.kind,
        status: view.status,
        completionPercentage: view.completionPercentage,
      })
    ) {
      continue;
    }

    const emailContext = await getTimesheetEmailContext(view.id, reference);
    const daysRemaining =
      schedule.kind === "REMINDER_3RD" ? 2 : getDaysRemainingInMonth(reference);

    await sendReminderMessage({
      kind: schedule.kind,
      recipient: view.ownerEmail,
      userName: view.ownerName,
      userId: view.userId,
      timesheetId: view.id,
      monthLabel: view.monthLabel,
      completionPercentage: view.completionPercentage,
      remainingHours: view.remainingHours,
      daysRemaining,
      deadlineDate: view.deadlines.submissionDeadlineDate,
      autoSubmitDate: view.deadlines.autoSubmitDate,
      submitUrl: emailContext.timesheetUrl,
      requestEditUrl: emailContext.requestEditUrl,
      supportContactEmail: config.supportContactEmail,
    });

    sentCount += 1;
  }

  return {
    reminderKind: schedule.kind,
    sentCount,
    evaluatedTimesheets,
  };
}

export async function runDailyAutomation(reference = new Date()) {
  const expirySummary = await expireApprovedEditWindows(reference);

  if (isExactAutoSubmitMoment(reference)) {
    const autoSubmitSummary = await runAutoSubmitJob(reference);
    return {
      expiredEditWindows: expirySummary.expiredCount,
      autoSubmitSummary,
      reminderSummary: null,
    };
  }

  const reminderSummary = await runReminderJob(reference);
  return {
    expiredEditWindows: expirySummary.expiredCount,
    autoSubmitSummary: null,
    reminderSummary,
  };
}
