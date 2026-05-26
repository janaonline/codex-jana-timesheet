import { addMonths, lastDayOfMonth } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import {
  DEFAULT_REMINDER_SCHEDULE,
  FIXED_AUTO_SUBMIT_DAY,
  IST_TIMEZONE,
  ReminderKind,
  TIMESHEET_PERIOD_BOUNDARY_DAY,
} from "@/lib/constants";
import { pad } from "@/lib/utils";

export type TimesheetPeriod = {
  monthKey: string;
  labelYear: number;
  labelMonth: number;
  periodStart: Date;
  periodEndExclusive: Date;
  visiblePeriodEnd: Date;
  autoSubmitAt: Date;
};

function parseMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
}

function formatDateKey(date: Date) {
  return formatInTimeZone(date, IST_TIMEZONE, "yyyy-MM-dd");
}

function toDateKey(date: Date | string) {
  if (typeof date === "string") {
    return date.includes("T")
      ? formatDateKey(new Date(date))
      : date.slice(0, 10);
  }

  return formatDateKey(date);
}

export function getMonthKey(reference = new Date()) {
  return getCurrentTimesheetMonthKey(reference);
}

export function getPreviousMonthKey(reference = new Date()) {
  return getPreviousTimesheetMonthKey(getCurrentTimesheetMonthKey(reference));
}

export function getMonthLabel(monthKey: string) {
  return formatTimesheetPeriodLabel(monthKey);
}

export function getMonthStart(monthKey: string) {
  return fromZonedTime(`${monthKey}-01T00:00:00`, IST_TIMEZONE);
}

export function getTimesheetPeriod(monthKey: string): TimesheetPeriod {
  const { year, month } = parseMonthKey(monthKey);
  const previousMonthAnchor = addMonths(new Date(Date.UTC(year, month - 1, 1)), -1);
  const periodStartKey = `${previousMonthAnchor.getUTCFullYear()}-${pad(
    previousMonthAnchor.getUTCMonth() + 1,
  )}-${pad(TIMESHEET_PERIOD_BOUNDARY_DAY)}`;
  const periodEndKey = `${year}-${pad(month)}-${pad(TIMESHEET_PERIOD_BOUNDARY_DAY)}`;
  const autoSubmitKey = `${year}-${pad(month)}-${pad(FIXED_AUTO_SUBMIT_DAY)}`;
  const periodEndExclusive = fromZonedTime(`${periodEndKey}T00:00:00`, IST_TIMEZONE);

  return {
    monthKey,
    labelYear: year,
    labelMonth: month,
    periodStart: fromZonedTime(`${periodStartKey}T00:00:00`, IST_TIMEZONE),
    periodEndExclusive,
    visiblePeriodEnd: new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000),
    autoSubmitAt: fromZonedTime(`${autoSubmitKey}T00:00:00`, IST_TIMEZONE),
  };
}

export function getTimesheetPeriodDates(monthKey: string) {
  const period = getTimesheetPeriod(monthKey);
  const dates: string[] = [];
  let cursor = new Date(period.periodStart);

  while (cursor < period.periodEndExclusive) {
    dates.push(formatDateKey(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
}

export function isDateInTimesheetPeriod(date: Date | string, monthKey: string) {
  const dateKey = toDateKey(date);
  const period = getTimesheetPeriod(monthKey);
  const startKey = formatDateKey(period.periodStart);
  const endKey = formatDateKey(period.periodEndExclusive);
  return dateKey >= startKey && dateKey < endKey;
}

export function getTimesheetAutoSubmitAt(monthKey: string) {
  return getTimesheetPeriod(monthKey).autoSubmitAt;
}

export function getCurrentTimesheetMonthKey(reference = new Date()) {
  const parts = getIstParts(reference);
  const labelMonth =
    parts.day >= TIMESHEET_PERIOD_BOUNDARY_DAY
      ? addMonths(new Date(Date.UTC(parts.year, parts.month - 1, 1)), 1)
      : new Date(Date.UTC(parts.year, parts.month - 1, 1));

  return `${labelMonth.getUTCFullYear()}-${pad(labelMonth.getUTCMonth() + 1)}`;
}

export function getPreviousTimesheetMonthKey(monthKey: string) {
  const { year, month } = parseMonthKey(monthKey);
  const previousMonth = addMonths(new Date(Date.UTC(year, month - 1, 1)), -1);
  return `${previousMonth.getUTCFullYear()}-${pad(previousMonth.getUTCMonth() + 1)}`;
}

export function getAutoSubmitTargetMonthKey(reference = new Date()) {
  return formatInTimeZone(reference, IST_TIMEZONE, "yyyy-MM");
}

export function formatTimesheetPeriodLabel(monthKey: string) {
  const period = getTimesheetPeriod(monthKey);
  const label = formatInTimeZone(getMonthStart(monthKey), IST_TIMEZONE, "LLLL yyyy");
  const startLabel = formatInTimeZone(period.periodStart, IST_TIMEZONE, "d LLL");
  const endLabel = formatInTimeZone(period.visiblePeriodEnd, IST_TIMEZONE, "d LLL");
  return `${label} (${startLabel} - ${endLabel})`;
}

export function getMonthEnd(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, 1));
  const end = lastDayOfMonth(utcDate);
  return `${year}-${pad(month)}-${pad(end.getUTCDate())}`;
}

export function listMonthDates(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    return `${year}-${pad(month)}-${pad(index + 1)}`;
  });
}

export function formatDisplayDate(date: Date | string) {
  const value =
    typeof date === "string"
      ? date.includes("T")
        ? new Date(date)
        : new Date(`${date}T00:00:00Z`)
      : date;
  return formatInTimeZone(value, IST_TIMEZONE, "dd/MM/yyyy");
}

export function isCurrentMonth(monthKey: string, reference = new Date()) {
  return monthKey === getMonthKey(reference);
}

export function isPastMonth(monthKey: string, reference = new Date()) {
  return monthKey < getMonthKey(reference);
}

export function isPreviousMonth(monthKey: string, reference = new Date()) {
  return monthKey === getPreviousMonthKey(reference);
}

export function isHistoricalMonth(monthKey: string, reference = new Date()) {
  return !isCurrentMonth(monthKey, reference) && !isPreviousMonth(monthKey, reference);
}

export function isValidMonthKey(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return false;
  }

  const [, monthPart] = monthKey.split("-");
  const month = Number(monthPart);
  return month >= 1 && month <= 12;
}

export function getIstParts(reference = new Date()) {
  const [year, month, day, hours, minutes] = formatInTimeZone(
    reference,
    IST_TIMEZONE,
    "yyyy-MM-dd-HH-mm",
  ).split("-");

  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hours: Number(hours),
    minutes: Number(minutes),
  };
}

export function isExactIstMidnight(reference = new Date()) {
  const parts = getIstParts(reference);
  return parts.hours === 0 && parts.minutes === 0;
}

export function isExactAutoSubmitMoment(reference = new Date()) {
  const parts = getIstParts(reference);
  return parts.day === FIXED_AUTO_SUBMIT_DAY && isExactIstMidnight(reference);
}

export function calculateWorkingDays(
  monthKey: string,
  joinDate: Date | null,
  exitDate: Date | null,
  holidays: string[],
) {
  const holidaySet = new Set(holidays);
  const joinDateKey = joinDate
    ? formatInTimeZone(joinDate, IST_TIMEZONE, "yyyy-MM-dd")
    : null;
  const exitDateKey = exitDate
    ? formatInTimeZone(exitDate, IST_TIMEZONE, "yyyy-MM-dd")
    : null;

  let workingDays = 0;

  for (const dateKey of getTimesheetPeriodDates(monthKey)) {
    if (
      (joinDateKey && dateKey < joinDateKey) ||
      (exitDateKey && dateKey > exitDateKey)
    ) {
      continue;
    }

    const [year, month, day] = dateKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    if (!isWeekend && !holidaySet.has(dateKey)) {
      workingDays += 1;
    }
  }

  return workingDays;
}

export function getDeadlineMetadata(monthKey: string) {
  const period = getTimesheetPeriod(monthKey);

  return {
    submissionDeadlineDate: formatDateKey(period.visiblePeriodEnd),
    autoSubmitDate: formatDateKey(period.autoSubmitAt),
  };
}

export function getOnTimeSubmissionCutoff(monthKey: string) {
  return getTimesheetAutoSubmitAt(monthKey);
}

export function getReminderRun(
  reference = new Date(),
  reminderDays: {
    currentMonthDraftDays: readonly number[];
    currentMonthSubmitDay: "last-day";
    nextMonthPendingDays: readonly number[];
  } = DEFAULT_REMINDER_SCHEDULE,
): { kind: ReminderKind; targetMonthKey: string } | null {
  const parts = getIstParts(reference);
  const currentMonthKey = getMonthKey(reference);
  const previousMonthKey = getPreviousMonthKey(reference);
  const lastDay = Number(
    formatDateKey(getTimesheetPeriod(currentMonthKey).visiblePeriodEnd).slice(-2),
  );
  const [firstDraftReminderDay, secondDraftReminderDay] =
    reminderDays.currentMonthDraftDays.length > 0
      ? reminderDays.currentMonthDraftDays
      : DEFAULT_REMINDER_SCHEDULE.currentMonthDraftDays;
  const nextMonthReminderDay =
    reminderDays.nextMonthPendingDays.find((day) => day !== FIXED_AUTO_SUBMIT_DAY) ??
    DEFAULT_REMINDER_SCHEDULE.nextMonthPendingDays[0];

  if (parts.day === FIXED_AUTO_SUBMIT_DAY) {
    return {
      kind: "FINAL_NOTICE_5TH",
      targetMonthKey: getAutoSubmitTargetMonthKey(reference),
    };
  }

  if (parts.day === firstDraftReminderDay) {
    return { kind: "REMINDER_25TH", targetMonthKey: currentMonthKey };
  }

  if (parts.day === secondDraftReminderDay) {
    return { kind: "REMINDER_28TH", targetMonthKey: currentMonthKey };
  }

  if (reminderDays.currentMonthSubmitDay === "last-day" && parts.day === lastDay) {
    return { kind: "REMINDER_LAST_DAY", targetMonthKey: currentMonthKey };
  }

  if (parts.day === nextMonthReminderDay) {
    return { kind: "REMINDER_3RD", targetMonthKey: previousMonthKey };
  }

  return null;
}

export function getDaysRemainingInMonth(reference = new Date()) {
  const parts = getIstParts(reference);
  const monthKey = getMonthKey(reference);
  const lastDay = Number(
    formatDateKey(getTimesheetPeriod(monthKey).visiblePeriodEnd).slice(-2),
  );
  return Math.max(0, lastDay - parts.day);
}

export function addWorkingDaysFromNextBusinessDay(
  reference: Date,
  workingDays: number,
  holidays: string[],
) {
  const holidaySet = new Set(holidays);
  let cursor = new Date(reference);
  let counted = 0;

  while (counted < workingDays) {
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    const dayKey = formatInTimeZone(cursor, IST_TIMEZONE, "yyyy-MM-dd");
    const weekday = Number(formatInTimeZone(cursor, IST_TIMEZONE, "i"));
    const isWeekend = weekday === 6 || weekday === 7;

    if (!isWeekend && !holidaySet.has(dayKey)) {
      counted += 1;
    }
  }

  return fromZonedTime(
    `${formatInTimeZone(cursor, IST_TIMEZONE, "yyyy-MM-dd")}T23:59:59`,
    IST_TIMEZONE,
  );
}
