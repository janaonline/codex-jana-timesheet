import type { ReminderKind, TimesheetStatus } from "@/lib/constants";
import {
  getMonthKey,
  getPreviousMonthKey,
  isExactAutoSubmitMoment,
  isHistoricalMonth,
  isPreviousMonth,
} from "@/lib/time";

export function isEligibleForAutoSubmit(params: {
  status: TimesheetStatus;
  assignedHours: number;
  totalHours: number;
  monthKey: string;
  reference: Date;
}) {
  return (
    params.status === "DRAFT" &&
    params.assignedHours > 0 &&
    params.totalHours === params.assignedHours &&
    params.monthKey === getPreviousMonthKey(params.reference) &&
    isExactAutoSubmitMoment(params.reference)
  );
}

export function shouldFreezeAfterCutoff(params: {
  status: TimesheetStatus;
  monthKey: string;
  reference: Date;
}) {
  return (
    params.status === "DRAFT" &&
    params.monthKey === getPreviousMonthKey(params.reference) &&
    isExactAutoSubmitMoment(params.reference)
  );
}

export function canEditTimesheet(params: {
  status: TimesheetStatus;
  monthKey: string;
  reference: Date;
  editWindowClosesAt?: Date | null;
}) {
  if (isHistoricalMonth(params.monthKey, params.reference)) {
    return false;
  }

  if (params.status === "DRAFT") {
    if (
      isPreviousMonth(params.monthKey, params.reference) &&
      params.reference >= getCutoffDate(params.monthKey)
    ) {
      return false;
    }

    return true;
  }

  if (params.status === "EDIT_APPROVED") {
    return Boolean(
      params.editWindowClosesAt && params.reference <= params.editWindowClosesAt,
    );
  }

  return false;
}

export function canSubmitTimesheet(params: {
  status: TimesheetStatus;
  monthKey: string;
  reference: Date;
  isExactlyComplete: boolean;
  editWindowClosesAt?: Date | null;
}) {
  if (!params.isExactlyComplete) {
    return false;
  }

  if (params.status === "EDIT_APPROVED") {
    return Boolean(
      params.editWindowClosesAt && params.reference <= params.editWindowClosesAt,
    );
  }

  if (params.status !== "DRAFT") {
    return false;
  }

  if (
    isPreviousMonth(params.monthKey, params.reference) &&
    params.reference >= getCutoffDate(params.monthKey)
  ) {
    return false;
  }

  return params.monthKey === getMonthKey(params.reference) ||
    params.monthKey === getPreviousMonthKey(params.reference);
}

export function canRequestEdit(params: {
  status: TimesheetStatus;
  monthKey: string;
  reference: Date;
}) {
  if (!isPreviousMonth(params.monthKey, params.reference)) {
    return false;
  }

  return ["SUBMITTED", "AUTO_SUBMITTED", "FROZEN", "REJECTED"].includes(
    params.status,
  );
}

export function shouldExpireEditWindow(params: {
  status: TimesheetStatus;
  editWindowClosesAt?: Date | null;
  reference: Date;
}) {
  return Boolean(
    params.status === "EDIT_APPROVED" &&
      params.editWindowClosesAt &&
      params.reference > params.editWindowClosesAt,
  );
}

export function isEligibleForReminder(params: {
  kind: ReminderKind;
  status: TimesheetStatus;
  completionPercentage: number;
}) {
  if (["SUBMITTED", "AUTO_SUBMITTED", "RESUBMITTED"].includes(params.status)) {
    return false;
  }

  switch (params.kind) {
    case "REMINDER_25TH":
    case "REMINDER_28TH":
      return params.status === "DRAFT";
    case "REMINDER_LAST_DAY":
      return params.status === "DRAFT" || params.completionPercentage < 100;
    case "REMINDER_3RD":
      return !["SUBMITTED", "AUTO_SUBMITTED", "RESUBMITTED"].includes(
        params.status,
      );
    case "FINAL_NOTICE_5TH":
      return true;
    default:
      return false;
  }
}

export function getCutoffDate(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month - 1, 1));
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return new Date(
    `${nextMonth.getUTCFullYear()}-${String(
      nextMonth.getUTCMonth() + 1,
    ).padStart(2, "0")}-05T00:00:00+05:30`,
  );
}
