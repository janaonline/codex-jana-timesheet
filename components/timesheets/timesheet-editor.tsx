"use client";

import Link from "next/link";
import { startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { Input } from "@/components/common/input";
import { Modal } from "@/components/common/modal";
import { ProgressBar } from "@/components/common/progress-bar";
import { Select } from "@/components/common/select";
import { Textarea } from "@/components/common/textarea";
import { useToast } from "@/components/common/toast-provider";
import { RequestEditModal } from "@/components/timesheets/request-edit-modal";
import { useAutosave } from "@/hooks/use-autosave";
import {
  ApiClientError,
  handleUnauthorizedApiClientError,
  parseJsonApiResponse,
} from "@/lib/client-api";
import { minutesToHours, normalizeHoursInputToMinutes } from "@/lib/timesheet-calculations";
import { formatDisplayDate } from "@/lib/time";
import type { TimesheetView } from "@/services/timesheet-service";

type EditorEntry = Omit<TimesheetView["entries"][number], "hours"> & {
  hours: TimesheetView["entries"][number]["hours"] | "";
  __uiId: string;
  __isEntering: boolean;
  __isRemoving: boolean;
  __isIncompleteDraft: boolean;
};

type EditorState = {
  id: string;
  version: number;
  entries: EditorEntry[];
};

type EditorEntrySeed = Omit<
  EditorEntry,
  "__uiId" | "__isEntering" | "__isRemoving" | "__isIncompleteDraft"
> &
  Partial<
    Pick<EditorEntry, "__uiId" | "__isEntering" | "__isRemoving" | "__isIncompleteDraft">
  > & {
    localId?: string;
  };

type EditorMode = "day" | "week" | "month";

type CalendarSelection =
  | "NONE"
  | "HALF_DAY"
  | "FULL_DAY"
  | "PERSONAL_NON_WORKING_DAY";

type WeekFormState = {
  weekStartDate: string;
  projectId: string;
  totalHours: string;
  description: string;
};

type MonthFormState = {
  projectId: string;
  totalHours: string;
  description: string;
};

type OverwriteState =
  | {
      kind: "week";
      details: string[];
      payload: WeekFormState;
    }
  | {
      kind: "month";
      details: string[];
      payload: MonthFormState;
    };

type ActiveMonthDateBounds = {
  minDate: string;
  maxDate: string;
};

type EntryTimerKind = "enter" | "remove";

const ENTRY_ANIMATION_MS = 500;
const ENTRY_ENTER_FRAME_MS = 20;

function createEditorEntry(entry: EditorEntrySeed): EditorEntry {
  return {
    ...entry,
    __uiId: entry.__uiId ?? entry.localId ?? entry.id,
    __isEntering: entry.__isEntering ?? false,
    __isRemoving: entry.__isRemoving ?? false,
    __isIncompleteDraft: entry.__isIncompleteDraft ?? false,
  };
}

function normalizeEditorState(timesheet: TimesheetView): EditorState {
  return {
    id: timesheet.id,
    version: timesheet.version,
    entries: timesheet.entries.map((entry) => createEditorEntry(entry)),
  };
}

function isTempEntry(entry: Pick<EditorEntry, "id">) {
  return entry.id.startsWith("temp-");
}

function isTempEntryReadyForSave(
  entry: Pick<EditorEntry, "workDate" | "projectId" | "hours">,
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  if (
    !entry.workDate ||
    entry.workDate < activeMonthDateBounds.minDate ||
    entry.workDate > activeMonthDateBounds.maxDate
  ) {
    return false;
  }

  if (!entry.projectId || entry.hours === "") {
    return false;
  }

  return normalizeHoursInputToMinutes(Number(entry.hours)).ok;
}

function syncIncompleteDraftFlag(
  entry: EditorEntry,
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  if (!isTempEntry(entry)) {
    return entry.__isIncompleteDraft ? { ...entry, __isIncompleteDraft: false } : entry;
  }

  const nextIsIncompleteDraft = !isTempEntryReadyForSave(entry, activeMonthDateBounds);
  return entry.__isIncompleteDraft === nextIsIncompleteDraft
    ? entry
    : {
        ...entry,
        __isIncompleteDraft: nextIsIncompleteDraft,
      };
}

function normalizeDraftState(
  state: EditorState,
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  return {
    ...state,
    entries: state.entries.map((entry) =>
      syncIncompleteDraftFlag(createEditorEntry(entry), activeMonthDateBounds),
    ),
  };
}

function isPersistableEntry(
  entry: EditorEntry,
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  if (entry.__isRemoving) {
    return false;
  }

  if (!isTempEntry(entry)) {
    return true;
  }

  return !entry.__isIncompleteDraft && isTempEntryReadyForSave(entry, activeMonthDateBounds);
}

function stripUiFields(entry: EditorEntry) {
  return {
    id: entry.id.startsWith("temp-") ? undefined : entry.id,
    workDate: entry.workDate,
    projectId: entry.projectId,
    hours: Number(entry.hours),
    description: entry.description,
  };
}

function toPersistableEntries(
  entries: EditorEntry[],
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  return entries.filter((entry) => isPersistableEntry(entry, activeMonthDateBounds));
}

function mergeClientOnlyEntries(
  serverState: EditorState,
  localEntries: EditorEntry[],
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  const clientOnlyEntries = localEntries.filter(
    (entry) =>
      entry.__isRemoving || !isPersistableEntry(entry, activeMonthDateBounds),
  );

  if (!clientOnlyEntries.length) {
    return serverState;
  }

  return {
    ...serverState,
    entries: [...clientOnlyEntries, ...serverState.entries],
  };
}

function getEntryKey(entry: EditorEntry) {
  return entry.id || entry.__uiId;
}

function getEntryAnimationClass(entry: EditorEntry) {
  const baseClassName =
    "transition-[opacity,transform] duration-500 motion-reduce:transform-none motion-reduce:transition-opacity";

  if (entry.__isRemoving) {
    return `${baseClassName} ease-in-out opacity-0 -translate-y-2 pointer-events-none`;
  }

  if (entry.__isEntering) {
    return `${baseClassName} ease-out opacity-0 -translate-y-2`;
  }

  return `${baseClassName} ease-out opacity-100 translate-y-0`;
}

function getEntryDisabledState(readOnly: boolean, entry: EditorEntry) {
  return readOnly || entry.__isRemoving;
}

function getEntryRemoveLabel(entry: EditorEntry) {
  return entry.__isRemoving ? "Removing..." : "Remove";
}

function getStoredDraftState(
  timesheetId: string,
  fallback: EditorState,
  activeMonthDateBounds: ActiveMonthDateBounds,
) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = localStorage.getItem(`timesheet-draft:${timesheetId}`);
    if (!rawValue) {
      return fallback;
    }

    const parsed = JSON.parse(rawValue) as { payload: EditorState; updatedAt: string };
    if (parsed.payload.version < fallback.version) {
      return fallback;
    }

    return normalizeDraftState(
      {
        ...parsed.payload,
        entries: parsed.payload.entries.map((entry) =>
          createEditorEntry({
            ...entry,
            __isEntering: false,
            __isRemoving: false,
          }),
        ),
      },
      activeMonthDateBounds,
    );
  } catch {
    return fallback;
  }
}

async function postJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return parseJsonApiResponse<T>(response, "Request failed.");
}

function toCalendarSelection(day: TimesheetView["calendarDays"][number]): CalendarSelection {
  if (day.isPersonalNonWorkingDay) {
    return "PERSONAL_NON_WORKING_DAY";
  }

  return day.leaveType;
}

function formatHoursValue(hours: number) {
  return Number(hours.toFixed(2)).toString();
}

function getActiveMonthDateBounds(
  calendarDays: TimesheetView["calendarDays"],
  monthKey: string,
) {
  const monthDates = calendarDays
    .map((day) => day.workDate)
    .filter((workDate) => workDate.startsWith(monthKey))
    .sort((left, right) => left.localeCompare(right));
  const [yearValue, monthValue] = monthKey.split("-").map(Number);
  const fallbackMaxDate = Number.isInteger(yearValue) && Number.isInteger(monthValue)
    ? new Date(Date.UTC(yearValue, monthValue, 0)).toISOString().slice(0, 10)
    : `${monthKey}-01`;

  return {
    minDate: monthDates[0] ?? `${monthKey}-01`,
    maxDate: monthDates[monthDates.length - 1] ?? fallbackMaxDate,
  };
}

function buildWeekOptions(calendarDays: TimesheetView["calendarDays"]) {
  const options = new Map<
    string,
    {
      weekStartDate: string;
      label: string;
    }
  >();

  for (const day of calendarDays) {
    const monday = startOfWeek(new Date(`${day.workDate}T00:00:00+05:30`), {
      weekStartsOn: 1,
    });
    const weekStartDate = formatInTimeZone(monday, "Asia/Kolkata", "yyyy-MM-dd");

    if (options.has(weekStartDate)) {
      continue;
    }

    const weekDates = Array.from({ length: 5 }, (_, index) => {
      const nextDate = new Date(monday.getTime() + index * 24 * 60 * 60 * 1000);
      return formatInTimeZone(nextDate, "Asia/Kolkata", "yyyy-MM-dd");
    }).filter((workDate) => workDate.startsWith(day.workDate.slice(0, 7)));

    if (!weekDates.length) {
      continue;
    }

    options.set(weekStartDate, {
      weekStartDate,
      label: `${formatDisplayDate(weekDates[0])} - ${formatDisplayDate(
        weekDates[weekDates.length - 1],
      )}`,
    });
  }

  return [...options.values()].sort((left, right) =>
    left.weekStartDate.localeCompare(right.weekStartDate),
  );
}

function summarizeDateStates(timesheet: TimesheetView) {
  return timesheet.dayStates.reduce(
    (summary, state) => {
      if (state.leaveType === "FULL_DAY") {
        summary.fullDayLeaves += 1;
      } else if (state.leaveType === "HALF_DAY") {
        summary.halfDayLeaves += 1;
      }

      if (state.isPersonalNonWorkingDay) {
        summary.personalNonWorkingDays += 1;
      }

      return summary;
    },
    {
      fullDayLeaves: 0,
      halfDayLeaves: 0,
      personalNonWorkingDays: 0,
    },
  );
}

export function TimesheetEditor({
  initialTimesheet,
  availableProjects,
  windowTimesheets,
}: {
  initialTimesheet: TimesheetView;
  availableProjects: Array<{ id: string; code: string; name: string }>;
  windowTimesheets: Array<{ id: string; monthKey: string; monthLabel: string }>;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const latestServerTimesheetRef = useRef(initialTimesheet);
  const entryTimersRef = useRef<Map<string, Partial<Record<EntryTimerKind, number>>>>(new Map());
  const initialActiveMonthDateBounds = getActiveMonthDateBounds(
    initialTimesheet.calendarDays,
    initialTimesheet.monthKey,
  );
  const [timesheet, setTimesheet] = useState(initialTimesheet);
  const [draft, setDraft] = useState<EditorState>(() =>
    getStoredDraftState(
      initialTimesheet.id,
      normalizeEditorState(initialTimesheet),
      initialActiveMonthDateBounds,
    ),
  );
  const [activeView, setActiveView] = useState<EditorMode>("day");
  const [requestEditOpen, setRequestEditOpen] = useState(false);
  const [calendarSavingDate, setCalendarSavingDate] = useState<string | null>(null);
  const [overwriteState, setOverwriteState] = useState<OverwriteState | null>(null);
  const [pendingActivityCount, setPendingActivityCount] = useState(0);
  const [weekForm, setWeekForm] = useState<WeekFormState>({
    weekStartDate: "",
    projectId: availableProjects[0]?.id ?? "",
    totalHours: "",
    description: "",
  });
  const [monthForm, setMonthForm] = useState<MonthFormState>({
    projectId: availableProjects[0]?.id ?? "",
    totalHours: "",
    description: "",
  });
  const weekOptions = useMemo(() => buildWeekOptions(timesheet.calendarDays), [timesheet.calendarDays]);
  const dateStateSummary = useMemo(() => summarizeDateStates(timesheet), [timesheet]);
  const activeMonthDateBounds = useMemo(
    () => getActiveMonthDateBounds(timesheet.calendarDays, timesheet.monthKey),
    [timesheet.calendarDays, timesheet.monthKey],
  );
  const activeEntries = useMemo(
    () => draft.entries.filter((entry) => !entry.__isRemoving),
    [draft.entries],
  );
  const totalMinutes = activeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalHours = minutesToHours(totalMinutes);
  const completionPercentage =
    timesheet.assignedMinutes > 0
      ? Number(((totalMinutes / timesheet.assignedMinutes) * 100).toFixed(2))
      : 0;
  const remainingMinutes = Math.max(0, timesheet.assignedMinutes - totalMinutes);
  const remainingHours = minutesToHours(remainingMinutes);
  const isExactlyComplete =
    timesheet.assignedMinutes > 0 && totalMinutes === timesheet.assignedMinutes;
  const readOnly = !timesheet.isEditable;

  useEffect(() => {
    const entryTimers = entryTimersRef.current;

    return () => {
      entryTimers.forEach((timers) => {
        Object.values(timers).forEach((timerId) => {
          if (typeof timerId === "number") {
            window.clearTimeout(timerId);
          }
        });
      });
      entryTimers.clear();
    };
  }, []);

  const autosave = useAutosave({
    storageKey: `timesheet-draft:${timesheet.id}`,
    value: draft,
    async onSave(currentValue) {
      const persistableEntries = toPersistableEntries(
        currentValue.entries,
        activeMonthDateBounds,
      );
      const result = await postJson<{
        timesheet: TimesheetView;
      }>(`/api/v1/timesheets/${timesheet.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: currentValue.version,
          entries: persistableEntries.map(stripUiFields),
        }),
      });

      latestServerTimesheetRef.current = result.timesheet;
      return mergeClientOnlyEntries(
        normalizeEditorState(result.timesheet),
        currentValue.entries,
        activeMonthDateBounds,
      );
    },
    onSaved(savedValue) {
      setDraft(savedValue);
      startTransition(() => {
        setTimesheet(latestServerTimesheetRef.current);
      });
    },
  });
  const isLoading = pendingActivityCount > 0 || autosave.status === "saving";
  const loadingLabel =
    autosave.status === "saving"
      ? "Saving latest changes..."
      : "Loading latest timesheet data...";

  function applyServerTimesheet(nextTimesheet: TimesheetView) {
    latestServerTimesheetRef.current = nextTimesheet;
    setTimesheet(nextTimesheet);
    setDraft((current) =>
      mergeClientOnlyEntries(
        normalizeEditorState(nextTimesheet),
        current.entries,
        activeMonthDateBounds,
      ),
    );
  }

  function showError(error: unknown, fallback: string) {
    if (handleUnauthorizedApiClientError(error)) {
      return;
    }

    pushToast({
      title: error instanceof Error ? error.message : fallback,
      tone: "error",
    });
  }

  async function trackAsyncActivity<T>(operation: () => Promise<T>) {
    setPendingActivityCount((current) => current + 1);

    try {
      return await operation();
    } finally {
      setPendingActivityCount((current) => Math.max(0, current - 1));
    }
  }

  async function flushDayDraft() {
    try {
      const saved = await autosave.saveNow();
      setDraft(saved);
      setTimesheet(latestServerTimesheetRef.current);
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      throw new ApiClientError(
        error instanceof Error ? error.message : "Unable to save the current draft.",
      );
    }
  }

  function clearEntryTimer(entryUiId: string, kind: EntryTimerKind) {
    const timers = entryTimersRef.current.get(entryUiId);
    if (!timers) {
      return;
    }

    const timerId = timers?.[kind];

    if (typeof timerId !== "number") {
      return;
    }

    window.clearTimeout(timerId);
    delete timers[kind];

    if (typeof timers.enter === "number" || typeof timers.remove === "number") {
      entryTimersRef.current.set(entryUiId, timers);
      return;
    }

    entryTimersRef.current.delete(entryUiId);
  }

  function setEntryTimer(entryUiId: string, kind: EntryTimerKind, timerId: number) {
    const timers = entryTimersRef.current.get(entryUiId) ?? {};
    timers[kind] = timerId;
    entryTimersRef.current.set(entryUiId, timers);
  }

  function patchEntry(
    entryUiId: string,
    updater: (entry: EditorEntry) => EditorEntry,
  ) {
    setDraft((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.__uiId === entryUiId ? updater(entry) : entry,
      ),
    }));
  }

  function settleEntry(entryUiId: string) {
    clearEntryTimer(entryUiId, "enter");
    const timerId = window.setTimeout(() => {
      clearEntryTimer(entryUiId, "enter");
      patchEntry(entryUiId, (entry) => ({
        ...entry,
        __isEntering: false,
      }));
    }, ENTRY_ENTER_FRAME_MS);
    setEntryTimer(entryUiId, "enter", timerId);
  }

  function updateEntry(
    entryUiId: string,
    field: keyof Omit<
      EditorEntry,
      "__uiId" | "__isEntering" | "__isRemoving" | "__isIncompleteDraft"
    >,
    value: string | number,
  ) {
    setDraft((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.__uiId === entryUiId
          ? syncIncompleteDraftFlag(
              {
                ...entry,
                [field]: value,
                projectName:
                  field === "projectId"
                    ? availableProjects.find((project) => project.id === value)?.name ?? ""
                    : entry.projectName,
                projectCode:
                  field === "projectId"
                    ? availableProjects.find((project) => project.id === value)?.code ?? ""
                    : entry.projectCode,
              },
              activeMonthDateBounds,
            )
          : entry,
      ),
    }));
  }

  function updateWorkDate(entryUiId: string, workDate: string) {
    if (
      workDate &&
      (workDate < activeMonthDateBounds.minDate || workDate > activeMonthDateBounds.maxDate)
    ) {
      return;
    }

    updateEntry(entryUiId, "workDate", workDate);
  }

  function addEntry() {
    const tempId = `temp-${crypto.randomUUID()}`;
    setDraft((current) => ({
      ...current,
      entries: [
        createEditorEntry({
          id: tempId,
          workDate: "",
          projectId: "",
          projectCode: "",
          projectName: "",
          minutes: 0,
          hours: "",
          description: "",
          createdVia: "DAY",
          lastEditedVia: "DAY",
          entryType: "Manual Entry",
          __uiId: tempId,
          __isEntering: true,
          __isIncompleteDraft: true,
        }),
        ...current.entries,
      ],
    }));
    settleEntry(tempId);
  }

  function deleteEntry(entryUiId: string) {
    clearEntryTimer(entryUiId, "enter");
    patchEntry(entryUiId, (entry) =>
      entry.__isRemoving
        ? entry
        : {
            ...entry,
            __isEntering: false,
            __isRemoving: true,
          },
    );
    clearEntryTimer(entryUiId, "remove");
    const timerId = window.setTimeout(() => {
      clearEntryTimer(entryUiId, "remove");
      setDraft((current) => ({
        ...current,
        entries: current.entries.filter((entry) => entry.__uiId !== entryUiId),
      }));
    }, ENTRY_ANIMATION_MS);
    setEntryTimer(entryUiId, "remove", timerId);
  }

  async function handleSubmit() {
    try {
      await trackAsyncActivity(async () => {
        await flushDayDraft();
        await postJson(`/api/v1/timesheets/${timesheet.id}/submit`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      });
      pushToast({ title: "Timesheet submitted successfully.", tone: "success" });
      router.push(`/timesheets/${timesheet.id}/confirmation`);
      router.refresh();
    } catch (error) {
      showError(error, "Submission failed.");
    }
  }

  async function handleRequestEdit(reason: string) {
    try {
      await trackAsyncActivity(() =>
        postJson(`/api/v1/timesheets/${timesheet.id}/edit-request`, {
          method: "POST",
          body: JSON.stringify({ reason }),
        }),
      );
      pushToast({ title: "Edit request submitted.", tone: "success" });
      setRequestEditOpen(false);
      router.refresh();
    } catch (error) {
      showError(error, "Edit request failed.");
    }
  }

  async function handleCalendarSelection(
    workDate: string,
    selection: CalendarSelection,
  ) {
    try {
      setCalendarSavingDate(workDate);
      await trackAsyncActivity(async () => {
        await flushDayDraft();
        const result = await postJson<{ timesheet: TimesheetView }>(
          `/api/v1/timesheets/${timesheet.id}/calendar`,
          {
            method: "PATCH",
            body: JSON.stringify({
              version: latestServerTimesheetRef.current.version,
              updates: [
                {
                  workDate,
                  leaveType:
                    selection === "PERSONAL_NON_WORKING_DAY" ? "NONE" : selection,
                  isPersonalNonWorkingDay:
                    selection === "PERSONAL_NON_WORKING_DAY",
                },
              ],
            }),
          },
        );
        applyServerTimesheet(result.timesheet);
      });
      pushToast({ title: "Calendar updated.", tone: "success" });
    } catch (error) {
      showError(error, "Unable to update the calendar.");
    } finally {
      setCalendarSavingDate(null);
    }
  }

  async function handleWeekApply(confirmOverwrite = false) {
    const payload = {
      ...weekForm,
      weekStartDate: weekForm.weekStartDate || weekOptions[0]?.weekStartDate || "",
    };

    try {
      await trackAsyncActivity(async () => {
        await flushDayDraft();
        const result = await postJson<{ timesheet: TimesheetView }>(
          `/api/v1/timesheets/${timesheet.id}/apply-week`,
          {
            method: "POST",
            body: JSON.stringify({
              version: latestServerTimesheetRef.current.version,
              projectId: payload.projectId,
              totalHours: Number(payload.totalHours),
              description: payload.description,
              weekStartDate: payload.weekStartDate,
              confirmOverwrite,
            }),
          },
        );
        applyServerTimesheet(result.timesheet);
      });
      setOverwriteState(null);
      pushToast({ title: "Week allocation applied.", tone: "success" });
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "OVERWRITE_CONFIRMATION_REQUIRED"
      ) {
        setOverwriteState({
          kind: "week",
          details: error.details ?? [],
          payload,
        });
        return;
      }

      showError(error, "Unable to apply the weekly allocation.");
    }
  }

  async function handleMonthApply(confirmOverwrite = false) {
    try {
      await trackAsyncActivity(async () => {
        await flushDayDraft();
        const result = await postJson<{ timesheet: TimesheetView }>(
          `/api/v1/timesheets/${timesheet.id}/apply-month`,
          {
            method: "POST",
            body: JSON.stringify({
              version: latestServerTimesheetRef.current.version,
              projectId: monthForm.projectId,
              totalHours: Number(monthForm.totalHours),
              description: monthForm.description,
              confirmOverwrite,
            }),
          },
        );
        applyServerTimesheet(result.timesheet);
      });
      setOverwriteState(null);
      pushToast({ title: "Month allocation applied.", tone: "success" });
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "OVERWRITE_CONFIRMATION_REQUIRED"
      ) {
        setOverwriteState({
          kind: "month",
          details: error.details ?? [],
          payload: monthForm,
        });
        return;
      }

      showError(error, "Unable to apply the monthly allocation.");
    }
  }

  const viewTabs = [
    { key: "day" as const, label: "Day View", enabled: true },
    { key: "week" as const, label: "Week View", enabled: timesheet.viewAvailability.week },
    { key: "month" as const, label: "Month View", enabled: timesheet.viewAvailability.month },
  ];

  return (
    <div className="space-y-6 pb-8">
      {isLoading ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50">
          <div className="inline-flex items-center gap-3 rounded-full border border-stone-200 bg-white/95 px-4 py-2 text-sm font-medium text-stone-700 shadow-[0_18px_40px_-28px_rgba(17,17,17,0.35)] backdrop-blur">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
            <span>{loadingLabel}</span>
          </div>
        </div>
      ) : null}

      <RequestEditModal
        open={requestEditOpen}
        onClose={() => setRequestEditOpen(false)}
        onSubmit={handleRequestEdit}
      />

      <Modal
        open={Boolean(overwriteState)}
        title="Replace existing rows?"
        onClose={() => setOverwriteState(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            The selected allocation would replace existing rows for the same sub-program
            on matching dates only.
          </p>
          <div className="rounded-[24px] border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
            {(overwriteState?.details ?? []).map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
          <div className="grid gap-3 sm:flex sm:justify-end">
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setOverwriteState(null)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                overwriteState?.kind === "week"
                  ? void handleWeekApply(true)
                  : void handleMonthApply(true)
              }
            >
              Confirm replacement
            </Button>
          </div>
        </div>
      </Modal>

      <Card className="space-y-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Monthly timesheet
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-stone-950 sm:text-4xl">
              {timesheet.monthLabel}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge tone={timesheet.status}>{timesheet.status.replaceAll("_", " ")}</Badge>
              {timesheet.editWindowClosesAt ? (
                <span className="text-sm text-stone-600">
                  Edit window closes on {formatDisplayDate(timesheet.editWindowClosesAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {windowTimesheets.map((item) => (
              <Link
                key={item.id}
                href={`/timesheets/${item.id}`}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  item.id === timesheet.id
                    ? "border-amber-300 bg-amber-300 text-stone-950"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {item.monthLabel}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-amber-200 bg-amber-50">
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Recorded hours</p>
            <p className="mt-3 text-3xl font-semibold text-stone-950">{formatHoursValue(totalHours)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Assigned hours</p>
            <p className="mt-3 text-3xl font-semibold text-stone-950">
              {formatHoursValue(timesheet.assignedHours)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Remaining hours</p>
            <p className="mt-3 text-3xl font-semibold text-stone-950">{formatHoursValue(remainingHours)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Auto-save</p>
            <p className="mt-3 text-lg font-semibold text-stone-950">
              {autosave.status === "saving"
                ? "Saving..."
                : autosave.status === "saved"
                  ? "Saved"
                  : autosave.status === "error"
                    ? "Save failed"
                    : "Idle"}
            </p>
          </Card>
        </div>

        <ProgressBar value={completionPercentage} label={`Completion: ${completionPercentage}%`} />

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
            Assigned hours now come from per-date capacity. Weekends, system holidays,
            full-day leave, half-day leave, and Personal Non-Working Days all affect the
            total automatically.
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white px-4 py-4 text-sm text-stone-700">
            <p className="font-semibold text-stone-900">Date-state summary</p>
            <p className="mt-2">Full-day leave: {dateStateSummary.fullDayLeaves}</p>
            <p>Half-day leave: {dateStateSummary.halfDayLeaves}</p>
            <p>Personal Non-Working Days: {dateStateSummary.personalNonWorkingDays}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {viewTabs
            .filter((tab) => tab.enabled)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeView === tab.key
                    ? "bg-amber-300 text-stone-950"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
                onClick={() => setActiveView(tab.key)}
              >
                {tab.label}
              </button>
            ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          {timesheet.calendarDays.map((day) => (
            <div
              key={day.workDate}
              className={`rounded-[24px] border px-4 py-4 text-sm ${
                day.isSystemHoliday
                  ? "border-rose-200 bg-rose-50"
                  : day.isWeekend
                    ? "border-stone-200 bg-stone-100"
                    : day.capacityMinutes === 0
                      ? "border-amber-200 bg-amber-50"
                      : "border-stone-200 bg-white"
              }`}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-stone-500">
                {formatDisplayDate(day.workDate)}
              </p>
              <p className="mt-2 font-semibold text-stone-900">
                {day.isSystemHoliday
                  ? "System holiday"
                  : day.isWeekend
                    ? "Weekend"
                    : day.isPersonalNonWorkingDay
                      ? "Personal Non-Working Day"
                      : day.leaveType === "FULL_DAY"
                        ? "Full-day leave"
                        : day.leaveType === "HALF_DAY"
                          ? "Half-day leave"
                          : "Working day"}
              </p>
              <p className="mt-1 text-stone-600">
                Capacity: {formatHoursValue(day.capacityHours)}h
              </p>
              <Select
                className="mt-3"
                value={toCalendarSelection(day)}
                disabled={readOnly || day.baseCapacityMinutes === 0 || calendarSavingDate === day.workDate}
                onChange={(event) =>
                  void handleCalendarSelection(
                    day.workDate,
                    event.target.value as CalendarSelection,
                  )
                }
              >
                <option value="NONE">Working day</option>
                <option value="HALF_DAY">Half-day leave</option>
                <option value="FULL_DAY">Full-day leave</option>
                <option value="PERSONAL_NON_WORKING_DAY">Personal Non-Working Day</option>
              </Select>
            </div>
          ))}
        </div>
      </Card>

      {activeView === "week" ? (
        <Card className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">Week allocation</h3>
            <p className="mt-1 text-sm text-stone-600">
              Allocate one sub-program across the selected Mon-Fri week segment using
              10-minute resolution.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Week
              <Select
                className="mt-2"
                value={weekForm.weekStartDate || weekOptions[0]?.weekStartDate || ""}
                onChange={(event) =>
                  setWeekForm((current) => ({
                    ...current,
                    weekStartDate: event.target.value,
                  }))
                }
                disabled={!timesheet.viewAvailability.week}
              >
                {weekOptions.map((option) => (
                  <option key={option.weekStartDate} value={option.weekStartDate}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Sub-program
              <Select
                className="mt-2"
                value={weekForm.projectId}
                onChange={(event) =>
                  setWeekForm((current) => ({ ...current, projectId: event.target.value }))
                }
              >
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Total hours
              <Input
                className="mt-2"
                type="number"
                step="any"
                min={0}
                value={weekForm.totalHours}
                onChange={(event) =>
                  setWeekForm((current) => ({ ...current, totalHours: event.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium text-stone-700 md:col-span-2">
              Description
              <Textarea
                className="mt-2"
                rows={4}
                value={weekForm.description}
                onChange={(event) =>
                  setWeekForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void handleWeekApply()}
            disabled={readOnly || !timesheet.viewAvailability.week}
          >
            Apply week allocation
          </Button>
        </Card>
      ) : null}

      {activeView === "month" ? (
        <Card className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">Month allocation</h3>
            <p className="mt-1 text-sm text-stone-600">
              Allocate one sub-program across all valid dates in the month. The result is
              written back as day-level rows.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Sub-program
              <Select
                className="mt-2"
                value={monthForm.projectId}
                onChange={(event) =>
                  setMonthForm((current) => ({ ...current, projectId: event.target.value }))
                }
              >
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} - {project.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Total hours
              <Input
                className="mt-2"
                type="number"
                step="any"
                min={0}
                value={monthForm.totalHours}
                onChange={(event) =>
                  setMonthForm((current) => ({ ...current, totalHours: event.target.value }))
                }
              />
            </label>
            <label className="text-sm font-medium text-stone-700 md:col-span-2">
              Description
              <Textarea
                className="mt-2"
                rows={4}
                value={monthForm.description}
                onChange={(event) =>
                  setMonthForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void handleMonthApply()}
            disabled={readOnly || !timesheet.viewAvailability.month}
          >
            Apply month allocation
          </Button>
        </Card>
      ) : null}

      {activeView === "day" ? (
        <Card className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-stone-950">Day view</h3>
              <p className="mt-1 text-sm text-stone-600">
                Day View remains the source of truth. Decimal hours are normalized to the
                nearest valid 10-minute increment.
              </p>
            </div>
            {!readOnly ? <Button className="w-full sm:w-auto" onClick={addEntry}>Add entry</Button> : null}
          </div>

          <div className="space-y-4 md:hidden">
            {draft.entries.map((entry, index) => (
              <div
                key={getEntryKey(entry)}
                className={`rounded-[28px] border border-stone-200 bg-stone-50 p-4 ${getEntryAnimationClass(
                  entry,
                )}`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                      Entry {index + 1}
                    </p>
                    <p className="mt-1 text-sm text-stone-600">{entry.entryType}</p>
                  </div>
                  {!readOnly ? (
                    <Button
                      variant="ghost"
                      disabled={entry.__isRemoving}
                      onClick={() => deleteEntry(entry.__uiId)}
                    >
                      {getEntryRemoveLabel(entry)}
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-4">
                  <label className="text-sm font-medium text-stone-700">
                    Date
                    <Input
                      className="mt-2"
                      type="date"
                      value={entry.workDate}
                      min={activeMonthDateBounds.minDate}
                      max={activeMonthDateBounds.maxDate}
                      disabled={getEntryDisabledState(readOnly, entry)}
                      onChange={(event) => updateWorkDate(entry.__uiId, event.target.value)}
                    />
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Sub-program
                    <Select
                      className="mt-2"
                      value={entry.projectId}
                      disabled={getEntryDisabledState(readOnly, entry)}
                      onChange={(event) =>
                        updateEntry(entry.__uiId, "projectId", event.target.value)
                      }
                    >
                      <option value="">Select sub-program</option>
                      {availableProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Hours
                    <Input
                      className="mt-2"
                      type="number"
                      step="any"
                      min={0}
                      value={entry.hours}
                      disabled={getEntryDisabledState(readOnly, entry)}
                      onChange={(event) =>
                        updateEntry(
                          entry.__uiId,
                          "hours",
                          event.target.value === "" ? "" : Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-stone-700">
                    Description
                    <Textarea
                      className="mt-2"
                      rows={3}
                      value={entry.description}
                      disabled={getEntryDisabledState(readOnly, entry)}
                      onChange={(event) =>
                        updateEntry(entry.__uiId, "description", event.target.value)
                      }
                      placeholder="Required before final submission"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-left text-stone-500">
                  <th className="px-3">Date</th>
                  <th className="px-3">Sub-program</th>
                  <th className="px-3">Hours</th>
                  <th className="px-3">Origin</th>
                  <th className="px-3">Description</th>
                  <th className="px-3" />
                </tr>
              </thead>
              <tbody>
                {draft.entries.map((entry) => (
                  <tr
                    key={getEntryKey(entry)}
                    className={`rounded-2xl bg-stone-50 ${getEntryAnimationClass(entry)}`}
                  >
                    <td className="px-3 py-3">
                      <Input
                        type="date"
                        value={entry.workDate}
                        min={activeMonthDateBounds.minDate}
                        max={activeMonthDateBounds.maxDate}
                        disabled={getEntryDisabledState(readOnly, entry)}
                        onChange={(event) => updateWorkDate(entry.__uiId, event.target.value)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Select
                        value={entry.projectId}
                        disabled={getEntryDisabledState(readOnly, entry)}
                        onChange={(event) =>
                          updateEntry(entry.__uiId, "projectId", event.target.value)
                        }
                      >
                        <option value="">Select sub-program</option>
                        {availableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.code} - {project.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-3">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        value={entry.hours}
                        disabled={getEntryDisabledState(readOnly, entry)}
                        onChange={(event) =>
                          updateEntry(
                            entry.__uiId,
                            "hours",
                            event.target.value === "" ? "" : Number(event.target.value),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-3 text-stone-600">
                      {entry.createdVia} / {entry.lastEditedVia}
                    </td>
                    <td className="px-3 py-3">
                      <Textarea
                        rows={2}
                        value={entry.description}
                        disabled={getEntryDisabledState(readOnly, entry)}
                        onChange={(event) =>
                          updateEntry(entry.__uiId, "description", event.target.value)
                        }
                        placeholder="Required before final submission"
                      />
                    </td>
                    <td className="px-3 py-3">
                      {!readOnly ? (
                        <Button
                          variant="ghost"
                          disabled={entry.__isRemoving}
                          onClick={() => deleteEntry(entry.__uiId)}
                        >
                          {getEntryRemoveLabel(entry)}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:flex sm:flex-wrap">
        {!readOnly ? (
          <Button
            className="w-full sm:w-auto"
            variant="secondary"
            onClick={() => {
              void autosave.saveNow().catch(() => undefined);
            }}
          >
            Save draft
          </Button>
        ) : null}
        {!readOnly && isExactlyComplete ? (
          <Button className="w-full sm:w-auto" onClick={handleSubmit}>
            Submit timesheet
          </Button>
        ) : null}
        {timesheet.canRequestEdit ? (
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setRequestEditOpen(true)}>
            Request edit
          </Button>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
