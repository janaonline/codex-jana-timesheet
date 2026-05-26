import { formatInTimeZone } from "date-fns-tz";

import {
  DAILY_CAPACITY_MINUTES,
  HALF_DAY_CAPACITY_MINUTES,
  HOUR_INPUT_NORMALIZATION_TOLERANCE_MINUTES,
  MINIMUM_TIME_ENTRY_MINUTES,
  type EntryOrigin,
  type LeaveType,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { getTimesheetPeriodDates, isDateInTimesheetPeriod } from "@/lib/time";
import { groupBy, percentage, sanitizeText } from "@/lib/utils";

export type DraftEntryInput = {
  id?: string;
  workDate: string;
  projectId: string;
  minutes: number;
  description?: string | null;
  createdVia?: EntryOrigin;
  lastEditedVia?: EntryOrigin;
};

export type TimesheetValidationMode = "draft" | "submit";

export type TimesheetDayStateInput = {
  workDate: string;
  leaveType: LeaveType;
  isManualHoliday: boolean;
};

export type CalendarDay = {
  workDate: string;
  isWeekend: boolean;
  isSystemHoliday: boolean;
  isWithinEmploymentWindow: boolean;
  leaveType: LeaveType;
  isManualHoliday: boolean;
  baseCapacityMinutes: number;
  capacityMinutes: number;
};

export type CapacitySummary = {
  workingDaysCount: number;
  leaveDays: number;
  assignedMinutes: number;
  assignedHours: number;
  calendarDays: CalendarDay[];
  effectiveDayStates: TimesheetDayStateInput[];
};

export type AllocationTargetDate = {
  workDate: string;
  capacityMinutes: number;
};

function toIstDateKey(date: Date | null) {
  if (!date) {
    return null;
  }

  return formatInTimeZone(date, "Asia/Kolkata", "yyyy-MM-dd");
}

function isWeekendDate(workDate: string) {
  const [year, month, day] = workDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function normalizeDayStates(dayStates: TimesheetDayStateInput[]) {
  const stateByDate = new Map<string, TimesheetDayStateInput>();

  for (const state of dayStates) {
    stateByDate.set(state.workDate, {
      workDate: state.workDate,
      leaveType: state.leaveType,
      isManualHoliday: state.isManualHoliday,
    });
  }

  return [...stateByDate.values()].sort((left, right) =>
    left.workDate.localeCompare(right.workDate),
  );
}

export function minutesToHours(minutes: number) {
  return Number((minutes / 60).toFixed(2));
}

export function hoursToMinutes(hours: number) {
  return Math.round(hours * 60);
}

export function normalizeHoursInputToMinutes(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return {
      ok: false as const,
      error: "Hours must be a positive number.",
    };
  }

  const rawMinutes = hours * 60;
  const normalizedMinutes =
    Math.round(rawMinutes / MINIMUM_TIME_ENTRY_MINUTES) *
    MINIMUM_TIME_ENTRY_MINUTES;

  if (
    Math.abs(rawMinutes - normalizedMinutes) >
    HOUR_INPUT_NORMALIZATION_TOLERANCE_MINUTES
  ) {
    return {
      ok: false as const,
      error:
        "Hours must align to 10-minute increments, for example 1, 1.17, 1.33, or 1.5.",
    };
  }

  return {
    ok: true as const,
    minutes: normalizedMinutes,
  };
}

export function isTenMinuteIncrement(minutes: number) {
  return Number.isInteger(minutes) && minutes % MINIMUM_TIME_ENTRY_MINUTES === 0;
}

export function calculateDerivedLeaveDays(dayStates: TimesheetDayStateInput[]) {
  return dayStates.reduce((sum, state) => {
    if (state.leaveType === "FULL_DAY") {
      return sum + 1;
    }

    if (state.leaveType === "HALF_DAY") {
      return sum + 0.5;
    }

    return sum;
  }, 0);
}

export function deriveLegacyDayStates(params: {
  monthKey: string;
  leaveDays: number;
  joinDate: Date | null;
  exitDate: Date | null;
  holidays: string[];
}) {
  if (params.leaveDays <= 0) {
    return [] satisfies TimesheetDayStateInput[];
  }

  const availableDates = buildCalendarDays({
    monthKey: params.monthKey,
    joinDate: params.joinDate,
    exitDate: params.exitDate,
    holidays: params.holidays,
    dayStates: [],
  })
    .filter((day) => day.baseCapacityMinutes > 0)
    .map((day) => day.workDate);

  const fullDays = Math.floor(params.leaveDays);
  const hasHalfDay = params.leaveDays - fullDays >= 0.5;
  const states: TimesheetDayStateInput[] = [];

  for (let index = 0; index < fullDays && index < availableDates.length; index += 1) {
    states.push({
      workDate: availableDates[index],
      leaveType: "FULL_DAY",
      isManualHoliday: false,
    });
  }

  if (hasHalfDay && availableDates[fullDays]) {
    states.push({
      workDate: availableDates[fullDays],
      leaveType: "HALF_DAY",
      isManualHoliday: false,
    });
  }

  return states;
}

export function buildCalendarDays(params: {
  monthKey: string;
  joinDate: Date | null;
  exitDate: Date | null;
  holidays: string[];
  dayStates: TimesheetDayStateInput[];
}) {
  const holidaySet = new Set(params.holidays);
  const stateByDate = new Map(
    normalizeDayStates(params.dayStates).map((state) => [state.workDate, state]),
  );
  const joinDateKey = toIstDateKey(params.joinDate);
  const exitDateKey = toIstDateKey(params.exitDate);

  return getTimesheetPeriodDates(params.monthKey).map((workDate) => {
    const isWeekend = isWeekendDate(workDate);
    const isSystemHoliday = holidaySet.has(workDate);
    const isWithinEmploymentWindow =
      (!joinDateKey || workDate >= joinDateKey) &&
      (!exitDateKey || workDate <= exitDateKey);
    const baseCapacityMinutes =
      isWithinEmploymentWindow && !isWeekend && !isSystemHoliday
        ? DAILY_CAPACITY_MINUTES
        : 0;
    const state = stateByDate.get(workDate) ?? {
      workDate,
      leaveType: "NONE" as LeaveType,
      isManualHoliday: false,
    };

    let capacityMinutes = baseCapacityMinutes;
    if (baseCapacityMinutes > 0) {
      if (state.isManualHoliday || state.leaveType === "FULL_DAY") {
        capacityMinutes = 0;
      } else if (state.leaveType === "HALF_DAY") {
        capacityMinutes = HALF_DAY_CAPACITY_MINUTES;
      }
    }

    return {
      workDate,
      isWeekend,
      isSystemHoliday,
      isWithinEmploymentWindow,
      leaveType: state.leaveType,
      isManualHoliday: state.isManualHoliday,
      baseCapacityMinutes,
      capacityMinutes,
    } satisfies CalendarDay;
  });
}

export function calculateAssignedHours(params: {
  monthKey: string;
  joinDate: Date | null;
  exitDate: Date | null;
  holidays: string[];
  dayStates?: TimesheetDayStateInput[];
  legacyLeaveDays?: number;
}) {
  const effectiveDayStates =
    params.dayStates && params.dayStates.length > 0
      ? normalizeDayStates(params.dayStates).filter((state) =>
          isDateInTimesheetPeriod(state.workDate, params.monthKey),
        )
      : deriveLegacyDayStates({
          monthKey: params.monthKey,
          leaveDays: params.legacyLeaveDays ?? 0,
          joinDate: params.joinDate,
          exitDate: params.exitDate,
          holidays: params.holidays,
        });

  const calendarDays = buildCalendarDays({
    monthKey: params.monthKey,
    joinDate: params.joinDate,
    exitDate: params.exitDate,
    holidays: params.holidays,
    dayStates: effectiveDayStates,
  });

  const assignedMinutes = calendarDays.reduce(
    (sum, day) => sum + day.capacityMinutes,
    0,
  );
  const workingDaysCount = calendarDays.filter(
    (day) => day.baseCapacityMinutes > 0,
  ).length;

  return {
    workingDaysCount,
    leaveDays: calculateDerivedLeaveDays(effectiveDayStates),
    assignedMinutes,
    assignedHours: minutesToHours(assignedMinutes),
    calendarDays,
    effectiveDayStates,
  } satisfies CapacitySummary;
}

export function sumRecordedMinutes(entries: DraftEntryInput[]) {
  return entries.reduce((sum, entry) => sum + Number(entry.minutes || 0), 0);
}

export function sumRecordedHours(entries: DraftEntryInput[]) {
  return minutesToHours(sumRecordedMinutes(entries));
}

export function getRemainingMinutes(totalMinutes: number, assignedMinutes: number) {
  return Math.max(0, assignedMinutes - totalMinutes);
}

export function getRemainingHours(totalMinutes: number, assignedMinutes: number) {
  return minutesToHours(getRemainingMinutes(totalMinutes, assignedMinutes));
}

export function getCompletionPercentage(
  totalMinutes: number,
  assignedMinutes: number,
) {
  if (assignedMinutes <= 0) {
    return 0;
  }

  return percentage(totalMinutes, assignedMinutes);
}

export function isExactCompletion(totalMinutes: number, assignedMinutes: number) {
  if (assignedMinutes <= 0) {
    return false;
  }

  return totalMinutes === assignedMinutes;
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

export function getDailyMinutes(entries: DraftEntryInput[]) {
  return groupBy(entries, (entry) => entry.workDate);
}

export function validateDayStateInput(
  calendarDay: CalendarDay,
  nextState: TimesheetDayStateInput,
) {
  if (nextState.isManualHoliday && nextState.leaveType !== "NONE") {
    throw new AppError(
      "INVALID_DAY_STATE",
      400,
      "A date cannot be both leave and a Holiday.",
    );
  }

  if (
    calendarDay.baseCapacityMinutes === 0 &&
    (nextState.leaveType !== "NONE" || nextState.isManualHoliday)
  ) {
    throw new AppError(
      "INVALID_DAY_STATE",
      400,
      `${calendarDay.workDate} is already unavailable because of a weekend, system holiday, or employment boundary.`,
    );
  }
}

export function validateTimesheetInput(params: {
  entries: DraftEntryInput[];
  assignedMinutes: number;
  calendarDays: CalendarDay[];
  mode: TimesheetValidationMode;
}) {
  const errors: string[] = [];
  const calendarDayMap = new Map(
    params.calendarDays.map((day) => [day.workDate, day]),
  );

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

    if (!Number.isInteger(entry.minutes) || entry.minutes <= 0) {
      errors.push(`${label}: hours must be a positive number.`);
    }

    if (!isTenMinuteIncrement(entry.minutes)) {
      errors.push(
        `${label}: hours must align to 10-minute increments, for example 1.17 or 1.33.`,
      );
    }

    if (params.mode === "submit" && !sanitizeText(entry.description)) {
      errors.push(`${label}: Description missing.`);
    }

    const calendarDay = calendarDayMap.get(entry.workDate);
    if (!calendarDay) {
      errors.push(`${label}: date must belong to the selected timesheet period.`);
      return;
    }

    if (calendarDay.capacityMinutes === 0) {
      errors.push(
        `${label}: ${entry.workDate} cannot accept time because the date capacity is 0.`,
      );
    }
  });

  const dailyTotals = getDailyMinutes(params.entries);
  Object.entries(dailyTotals).forEach(([workDate, workEntries]) => {
    const dailyMinutes = sumRecordedMinutes(workEntries);
    const calendarDay = calendarDayMap.get(workDate);

    if (!calendarDay) {
      return;
    }

    if (dailyMinutes > calendarDay.capacityMinutes) {
      errors.push(
        `${workDate}: exceeds the daily capacity of ${minutesToHours(
          calendarDay.capacityMinutes,
        )} hours.`,
      );
    }
  });

  const totalMinutes = sumRecordedMinutes(params.entries);
  if (totalMinutes > params.assignedMinutes) {
    errors.push("Total recorded hours cannot exceed assigned hours.");
  }

  if (params.mode === "submit" && !isExactCompletion(totalMinutes, params.assignedMinutes)) {
    errors.push("Total Hours does not match assigned hours.");
  }

  return {
    errors,
    totalMinutes,
    totalHours: minutesToHours(totalMinutes),
    remainingMinutes: getRemainingMinutes(totalMinutes, params.assignedMinutes),
    remainingHours: getRemainingHours(totalMinutes, params.assignedMinutes),
    completionPercentage: getCompletionPercentage(totalMinutes, params.assignedMinutes),
    isExactlyComplete: isExactCompletion(totalMinutes, params.assignedMinutes),
  };
}

export function assertValidTimesheetInput(params: {
  entries: DraftEntryInput[];
  assignedMinutes: number;
  calendarDays: CalendarDay[];
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

export function listWeekdaysForWeekInMonth(weekStartDate: string, monthKey: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(`${weekStartDate}T00:00:00+05:30`);
    const date = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return formatInTimeZone(date, "Asia/Kolkata", "yyyy-MM-dd");
  }).filter((workDate) => {
    if (!isDateInTimesheetPeriod(workDate, monthKey)) {
      return false;
    }

    const [year, month, day] = workDate.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  });
}

export function distributeMinutesEvenly(params: {
  totalMinutes: number;
  targets: AllocationTargetDate[];
}) {
  if (params.totalMinutes <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Hours must be greater than 0.",
    );
  }

  if (!isTenMinuteIncrement(params.totalMinutes)) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Hours must align to 10-minute increments.",
    );
  }

  const eligibleTargets = params.targets
    .filter((target) => target.capacityMinutes > 0)
    .sort((left, right) => left.workDate.localeCompare(right.workDate));

  if (!eligibleTargets.length) {
    throw new AppError(
      "TIMESHEET_CAPACITY_CONFLICT",
      400,
      "No eligible working dates are available for this allocation.",
    );
  }

  const totalCapacity = eligibleTargets.reduce(
    (sum, target) => sum + target.capacityMinutes,
    0,
  );

  if (params.totalMinutes > totalCapacity) {
    throw new AppError(
      "TIMESHEET_CAPACITY_CONFLICT",
      400,
      "The requested hours do not fit within the remaining daily capacity.",
      eligibleTargets.map(
        (target) =>
          `${target.workDate}: only ${minutesToHours(target.capacityMinutes)} hours available.`,
      ),
    );
  }

  const allocation = new Map<string, number>(
    eligibleTargets.map((target) => [target.workDate, 0]),
  );
  const evenShare =
    Math.floor(
      params.totalMinutes / eligibleTargets.length / MINIMUM_TIME_ENTRY_MINUTES,
    ) * MINIMUM_TIME_ENTRY_MINUTES;

  let remainingMinutes = params.totalMinutes;

  if (evenShare > 0) {
    for (const target of eligibleTargets) {
      const assigned = Math.min(evenShare, target.capacityMinutes);
      allocation.set(target.workDate, assigned);
      remainingMinutes -= assigned;
    }
  }

  while (remainingMinutes > 0) {
    let progressed = false;

    for (const target of eligibleTargets) {
      const assigned = allocation.get(target.workDate) ?? 0;
      if (assigned + MINIMUM_TIME_ENTRY_MINUTES > target.capacityMinutes) {
        continue;
      }

      allocation.set(
        target.workDate,
        assigned + MINIMUM_TIME_ENTRY_MINUTES,
      );
      remainingMinutes -= MINIMUM_TIME_ENTRY_MINUTES;
      progressed = true;

      if (remainingMinutes === 0) {
        break;
      }
    }

    if (!progressed) {
      throw new AppError(
        "TIMESHEET_CAPACITY_CONFLICT",
        400,
        "The requested hours do not fit within the remaining daily capacity.",
      );
    }
  }

  return [...allocation.entries()]
    .filter(([, minutes]) => minutes > 0)
    .map(([workDate, minutes]) => ({
      workDate,
      minutes,
    }));
}
