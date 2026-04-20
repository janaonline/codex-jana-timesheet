import { minutesToHours } from "@/lib/timesheet-calculations";

function formatHoursValue(hours: number) {
  return Number(hours.toFixed(2)).toString();
}

function formatMinutesAsHours(minutes: number) {
  return formatHoursValue(minutesToHours(minutes));
}

export function sumMinutesByWorkDate(
  entries: Array<{ workDate: string; minutes: number }>,
) {
  return entries.reduce<Record<string, number>>((accumulator, entry) => {
    accumulator[entry.workDate] = (accumulator[entry.workDate] ?? 0) + entry.minutes;
    return accumulator;
  }, {});
}

export function formatDayUtilization(
  recordedMinutes: number,
  availableMinutes: number,
) {
  if (availableMinutes <= 0) {
    return "-";
  }

  return `${formatMinutesAsHours(recordedMinutes)}/${formatMinutesAsHours(availableMinutes)} hrs`;
}

export function isExactlyUtilized(
  recordedMinutes: number,
  availableMinutes: number,
) {
  return availableMinutes > 0 && recordedMinutes === availableMinutes;
}
