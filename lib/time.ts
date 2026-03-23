import { addMonths, lastDayOfMonth } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

import { IST_TIMEZONE, ReminderKind } from "@/lib/constants";
import { pad } from "@/lib/utils";

export function getMonthKey(reference = new Date()) {
  return formatInTimeZone(reference, IST_TIMEZONE, "yyyy-MM");
}

export function getPreviousMonthKey(reference = new Date()) {
  const zoned = toZonedTime(reference, IST_TIMEZONE);
  return formatInTimeZone(addMonths(zoned, -1), IST_TIMEZONE, "yyyy-MM");
}

export function getMonthLabel(monthKey: string) {
  const start = getMonthStart(monthKey);
  return formatInTimeZone(start, IST_TIMEZONE, "LLLL yyyy");
}

export function getMonthStart(monthKey: string) {
  return fromZonedTime(`${monthKey}-01T00:00:00`, IST_TIMEZONE);
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

export function isPreviousMonth(monthKey: string, reference = new Date()) {
  return monthKey === getPreviousMonthKey(reference);
}

export function isHistoricalMonth(monthKey: string, reference = new Date()) {
  return !isCurrentMonth(monthKey, reference) && !isPreviousMonth(monthKey, reference);
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
  return parts.day === 5 && isExactIstMidnight(reference);
}

export function calculateWorkingDays(
  monthKey: string,
  joinDate: Date | null,
  exitDate: Date | null,
  holidays: string[],
) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const holidaySet = new Set(holidays);

  let startDay = 1;
  let endDay = daysInMonth;

  const joinDateKey = joinDate
    ? formatInTimeZone(joinDate, IST_TIMEZONE, "yyyy-MM-dd")
    : null;
  const exitDateKey = exitDate
    ? formatInTimeZone(exitDate, IST_TIMEZONE, "yyyy-MM-dd")
    : null;

  if (joinDateKey?.startsWith(monthKey)) {
    startDay = Number(joinDateKey.slice(-2));
  }

  if (exitDateKey?.startsWith(monthKey)) {
    endDay = Number(exitDateKey.slice(-2));
  }

  if (joinDateKey && joinDateKey.slice(0, 7) > monthKey) {
    return 0;
  }

  if (exitDateKey && exitDateKey.slice(0, 7) < monthKey) {
    return 0;
  }

  let workingDays = 0;

  for (let day = startDay; day <= endDay; day += 1) {
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    if (!isWeekend && !holidaySet.has(dateKey)) {
      workingDays += 1;
    }
  }

  return workingDays;
}

export function getDeadlineMetadata(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const autoSubmitReference = addMonths(nextMonthDate, 1);
  const autoSubmitDate = `${autoSubmitReference.getUTCFullYear()}-${pad(
    autoSubmitReference.getUTCMonth() + 1,
  )}-05`;

  return {
    submissionDeadlineDate: getMonthEnd(monthKey),
    autoSubmitDate,
  };
}

export function getReminderRun(
  reference = new Date(),
): { kind: ReminderKind; targetMonthKey: string } | null {
  const parts = getIstParts(reference);
  const currentMonthKey = getMonthKey(reference);
  const previousMonthKey = getPreviousMonthKey(reference);
  const lastDay = Number(getMonthEnd(currentMonthKey).slice(-2));

  if (parts.day === 25) {
    return { kind: "REMINDER_25TH", targetMonthKey: currentMonthKey };
  }

  if (parts.day === 28) {
    return { kind: "REMINDER_28TH", targetMonthKey: currentMonthKey };
  }

  if (parts.day === lastDay) {
    return { kind: "REMINDER_LAST_DAY", targetMonthKey: currentMonthKey };
  }

  if (parts.day === 3) {
    return { kind: "REMINDER_3RD", targetMonthKey: previousMonthKey };
  }

  if (parts.day === 5) {
    return { kind: "FINAL_NOTICE_5TH", targetMonthKey: previousMonthKey };
  }

  return null;
}

export function getDaysRemainingInMonth(reference = new Date()) {
  const parts = getIstParts(reference);
  const monthKey = getMonthKey(reference);
  const lastDay = Number(getMonthEnd(monthKey).slice(-2));
  return lastDay - parts.day;
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
