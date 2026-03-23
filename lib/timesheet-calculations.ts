import { AppError } from "@/lib/errors";
import { calculateWorkingDays } from "@/lib/time";
import { groupBy, percentage, sanitizeText } from "@/lib/utils";

export type DraftEntryInput = {
  id?: string;
  workDate: string;
  projectId: string;
  hours: number;
  description?: string | null;
};

export type TimesheetValidationMode = "draft" | "submit";

export function isQuarterHourIncrement(value: number) {
  return Number.isInteger(value * 4);
}

export function calculateAssignedHoursFromWorkingDays(
  workingDaysCount: number,
  leaveDays: number,
) {
  return Math.max(0, workingDaysCount * 8 - leaveDays * 8);
}

export function calculateAssignedHours(params: {
  monthKey: string;
  leaveDays: number;
  joinDate: Date | null;
  exitDate: Date | null;
  holidays: string[];
}) {
  const workingDaysCount = calculateWorkingDays(
    params.monthKey,
    params.joinDate,
    params.exitDate,
    params.holidays,
  );

  return {
    workingDaysCount,
    assignedHours: calculateAssignedHoursFromWorkingDays(
      workingDaysCount,
      params.leaveDays,
    ),
  };
}

export function sumRecordedHours(entries: DraftEntryInput[]) {
  return entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
}

export function getRemainingHours(totalHours: number, assignedHours: number) {
  return Math.max(0, Number((assignedHours - totalHours).toFixed(2)));
}

export function getCompletionPercentage(totalHours: number, assignedHours: number) {
  if (assignedHours <= 0) {
    return 0;
  }

  return percentage(totalHours, assignedHours);
}

export function isExactCompletion(totalHours: number, assignedHours: number) {
  if (assignedHours <= 0) {
    return false;
  }

  return Number(totalHours.toFixed(2)) === Number(assignedHours.toFixed(2));
}

export function getCompletionBand(percentageComplete: number) {
  if (percentageComplete >= 100) {
    return "green";
  }

  if (percentageComplete >= 80) {
    return "yellow";
  }

  return "red";
}

export function getDailyHours(entries: DraftEntryInput[]) {
  return groupBy(entries, (entry) => entry.workDate);
}

export function validateTimesheetInput(params: {
  entries: DraftEntryInput[];
  leaveDays: number;
  assignedHours: number;
  mode: TimesheetValidationMode;
}) {
  const errors: string[] = [];

  if (!Number.isInteger(params.leaveDays) || params.leaveDays < 0) {
    errors.push("Number of leaves must be a whole number greater than or equal to 0.");
  }

  if (params.mode === "submit" && params.entries.length === 0) {
    errors.push("At least one timesheet entry is required before submission.");
  }

  params.entries.forEach((entry, index) => {
    const label = `Entry ${index + 1}`;

    if (!entry.workDate) {
      errors.push(`${label}: date is required.`);
    }

    if (!entry.projectId) {
      errors.push(`${label}: sub-program is required.`);
    }

    if (!Number.isFinite(entry.hours) || entry.hours <= 0) {
      errors.push(`${label}: hours contributed must be a positive number.`);
    }

    if (!isQuarterHourIncrement(entry.hours)) {
      errors.push(`${label}: hours contributed must be in 0.25 hour increments.`);
    }

    if (params.mode === "submit" && !sanitizeText(entry.description)) {
      errors.push(`${label}: description is required before submission.`);
    }
  });

  const dailyTotals = getDailyHours(params.entries);
  Object.entries(dailyTotals).forEach(([workDate, workEntries]) => {
    const dailyHours = sumRecordedHours(workEntries);
    if (dailyHours > 24) {
      errors.push(`Daily total cannot exceed 24 hours for ${workDate}.`);
    }
  });

  const totalHours = Number(sumRecordedHours(params.entries).toFixed(2));
  if (totalHours > params.assignedHours) {
    errors.push("Total recorded hours cannot exceed assigned hours.");
  }

  if (params.mode === "submit" && !isExactCompletion(totalHours, params.assignedHours)) {
    errors.push("Submission requires exact 100% completion of assigned hours.");
  }

  return {
    errors,
    totalHours,
    remainingHours: getRemainingHours(totalHours, params.assignedHours),
    completionPercentage: getCompletionPercentage(totalHours, params.assignedHours),
    isExactlyComplete: isExactCompletion(totalHours, params.assignedHours),
  };
}

export function assertValidTimesheetInput(params: {
  entries: DraftEntryInput[];
  leaveDays: number;
  assignedHours: number;
  mode: TimesheetValidationMode;
}) {
  const validation = validateTimesheetInput(params);
  if (validation.errors.length > 0) {
    throw new AppError(
      "TIMESHEET_VALIDATION_FAILED",
      400,
      "Timesheet validation failed.",
      validation.errors,
    );
  }

  return validation;
}
