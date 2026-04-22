"use client";

import { startOfWeek } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { GlobalLoaderLink } from "@/components/common/global-loader-link";
import { useGlobalLoader } from "@/components/common/global-loader-provider";
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
import {
  formatDayUtilization,
  isExactlyUtilized,
  sumMinutesByWorkDate,
} from "@/lib/timesheet-calendar-display";
import {
  appendAllocationForm,
  createMonthAllocationForm,
  createWeekAllocationForm,
  removeAllocationForm,
  type MonthAllocationFormState,
  type WeekAllocationFormState,
} from "@/lib/timesheet-allocation-forms";
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
  | "HOLIDAY";

type OverwriteState =
  | {
      kind: "week";
      details: string[];
      payload: WeekAllocationFormState;
    }
  | {
      kind: "month";
      details: string[];
      payload: MonthAllocationFormState;
    };

type HolidayConfirmationState = {
  workDate: string;
  details: string[];
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
  excludedWorkDates: string[] = [],
) {
  const excludedWorkDateSet = new Set(excludedWorkDates);
  const clientOnlyEntries = localEntries.filter(
    (entry) =>
      !excludedWorkDateSet.has(entry.workDate) &&
      (entry.__isRemoving || !isPersistableEntry(entry, activeMonthDateBounds)),
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
  if (day.isManualHoliday) {
    return "HOLIDAY";
  }

  return day.leaveType;
}

function getCalendarStateLabel(day: TimesheetView["calendarDays"][number]) {
  if (day.isSystemHoliday) {
    return "System Holiday";
  }

  if (day.isWeekend) {
    return "Weekend";
  }

  if (day.isManualHoliday) {
    return "Holiday";
  }

  if (day.leaveType === "FULL_DAY") {
    return "Full Day Leave";
  }

  if (day.leaveType === "HALF_DAY") {
    return "Half Day Leave";
  }

  return "Working Day";
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

      if (state.isManualHoliday) {
        summary.manualHolidays += 1;
      }

      return summary;
    },
    {
      fullDayLeaves: 0,
      halfDayLeaves: 0,
      manualHolidays: 0,
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
  const { beginRouteTransition, runWithLoader } = useGlobalLoader();
  const latestServerTimesheetRef = useRef(initialTimesheet);
  const saveSnapshotRef = useRef<EditorEntry[] | null>(null);
  const entryTimersRef = useRef<Map<string, Partial<Record<EntryTimerKind, number>>>>(new Map());
  const defaultProjectId = availableProjects[0]?.id ?? "";
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
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  const [requestEditOpen, setRequestEditOpen] = useState(false);
  const [calendarSavingDate, setCalendarSavingDate] = useState<string | null>(null);
  const [holidayConfirmationState, setHolidayConfirmationState] =
    useState<HolidayConfirmationState | null>(null);
  const [overwriteState, setOverwriteState] = useState<OverwriteState | null>(null);
  const [weekForms, setWeekForms] = useState<WeekAllocationFormState[]>(() => [
    createWeekAllocationForm("week-0", defaultProjectId),
  ]);
  const [monthForms, setMonthForms] = useState<MonthAllocationFormState[]>(() => [
    createMonthAllocationForm("month-0", defaultProjectId),
  ]);
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
  const dailyRecordedMinutes = useMemo(
    () => sumMinutesByWorkDate(activeEntries),
    [activeEntries],
  );
  const totalMinutes = activeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalHours = minutesToHours(totalMinutes);
  const selectableCalendarDayCount = useMemo(
    () => timesheet.calendarDays.filter((day) => day.baseCapacityMinutes > 0).length,
    [timesheet.calendarDays],
  );
  const completionPercentage =
    timesheet.assignedMinutes > 0
      ? Number(((totalMinutes / timesheet.assignedMinutes) * 100).toFixed(2))
      : 0;
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
      saveSnapshotRef.current = currentValue.entries;
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
      setDraft((current) => {
        const snapshot = saveSnapshotRef.current;
        const userEditedDuringFlight =
          snapshot !== null &&
          JSON.stringify(current.entries) !== JSON.stringify(snapshot);
        if (userEditedDuringFlight) {
          // Keep the user's in-progress entries; only advance the version so the
          // next autosave sends the correct optimistic-concurrency token.
          return { ...current, version: latestServerTimesheetRef.current.version };
        }
        return savedValue;
      });
      startTransition(() => {
        setTimesheet(latestServerTimesheetRef.current);
      });
    },
  });

  function applyServerTimesheet(nextTimesheet: TimesheetView, excludedWorkDates: string[] = []) {
    latestServerTimesheetRef.current = nextTimesheet;
    setTimesheet(nextTimesheet);
    setDraft((current) =>
      mergeClientOnlyEntries(
        normalizeEditorState(nextTimesheet),
        current.entries,
        activeMonthDateBounds,
        excludedWorkDates,
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

  function addWeekForm() {
    setWeekForms((current) =>
      appendAllocationForm(
        current,
        createWeekAllocationForm(`week-${crypto.randomUUID()}`, defaultProjectId),
      ),
    );
  }

  function updateWeekForm(
    rowId: string,
    field: keyof Omit<WeekAllocationFormState, "id">,
    value: string,
  ) {
    setWeekForms((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function removeWeekForm(rowId: string) {
    setWeekForms((current) =>
      current.length > 1 ? removeAllocationForm(current, rowId) : current,
    );
  }

  function addMonthForm() {
    setMonthForms((current) =>
      appendAllocationForm(
        current,
        createMonthAllocationForm(`month-${crypto.randomUUID()}`, defaultProjectId),
      ),
    );
  }

  function updateMonthForm(
    rowId: string,
    field: keyof Omit<MonthAllocationFormState, "id">,
    value: string,
  ) {
    setMonthForms((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }

  function removeMonthForm(rowId: string) {
    setMonthForms((current) =>
      current.length > 1 ? removeAllocationForm(current, rowId) : current,
    );
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
      await runWithLoader({
        mode: "blocking",
        message: "Submitting timesheet...",
        operation: async () => {
          await flushDayDraft();
          await postJson(`/api/v1/timesheets/${timesheet.id}/submit`, {
            method: "POST",
            body: JSON.stringify({}),
          });
        },
      });
      pushToast({ title: "Timesheet submitted successfully.", tone: "success" });
      beginRouteTransition("Loading confirmation...");
      router.push(`/timesheets/${timesheet.id}/confirmation`);
      router.refresh();
    } catch (error) {
      showError(error, "Submission failed.");
    }
  }

  async function handleRequestEdit(reason: string) {
    try {
      await runWithLoader({
        mode: "blocking",
        message: "Submitting edit request...",
        operation: () =>
          postJson(`/api/v1/timesheets/${timesheet.id}/edit-request`, {
            method: "POST",
            body: JSON.stringify({ reason }),
          }),
      });
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
    confirmEntryClear = false,
  ) {
    try {
      setCalendarSavingDate(workDate);
      await runWithLoader({
        mode: "blocking",
        message: "Updating calendar...",
        operation: async () => {
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
                    leaveType: selection === "HOLIDAY" ? "NONE" : selection,
                    isManualHoliday: selection === "HOLIDAY",
                    confirmEntryClear,
                  },
                ],
              }),
            },
          );
          applyServerTimesheet(
            result.timesheet,
            selection === "HOLIDAY" ? [workDate] : [],
          );
        },
      });
      setHolidayConfirmationState(null);
      pushToast({ title: "Calendar updated.", tone: "success" });
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === "HOLIDAY_CONFIRMATION_REQUIRED" &&
        selection === "HOLIDAY" &&
        !confirmEntryClear
      ) {
        setHolidayConfirmationState({
          workDate,
          details: error.details ?? [],
        });
        return;
      }

      showError(error, "Unable to update the calendar.");
    } finally {
      setCalendarSavingDate(null);
    }
  }

  async function handleWeekApply(
    weekForm: WeekAllocationFormState,
    confirmOverwrite = false,
  ) {
    const payload = {
      ...weekForm,
      weekStartDate: weekForm.weekStartDate || weekOptions[0]?.weekStartDate || "",
    };

    try {
      await runWithLoader({
        mode: "blocking",
        message: "Applying week allocation...",
        operation: async () => {
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
        },
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

  async function handleMonthApply(
    monthForm: MonthAllocationFormState,
    confirmOverwrite = false,
  ) {
    try {
      await runWithLoader({
        mode: "blocking",
        message: "Applying month allocation...",
        operation: async () => {
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
        },
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
      {autosave.status === "saving" ? (
        <div className="pointer-events-none fixed right-4 top-4 z-50">
          <div className="inline-flex items-center gap-3 rounded-full border border-(--color-border) bg-(--color-surface)/95 px-4 py-2 text-sm font-medium text-(--color-text-subtle) shadow-[0_18px_40px_-28px_rgba(17,17,17,0.35)] backdrop-blur">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-(--color-border-strong) border-t-(--color-text-subtle)" />
            <span>Saving latest changes...</span>
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
          <p className="text-sm text-(--color-text-muted)">
            The selected allocation would replace existing rows for the same sub-program
            on matching dates only.
          </p>
          <div className="rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)">
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
              onClick={() => {
                if (!overwriteState) {
                  return;
                }

                if (overwriteState.kind === "week") {
                  void handleWeekApply(overwriteState.payload, true);
                  return;
                }

                void handleMonthApply(overwriteState.payload, true);
              }}
            >
              Confirm replacement
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(holidayConfirmationState)}
        title="Apply Holiday?"
        onClose={() => setHolidayConfirmationState(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-(--color-text-muted)">
            Applying Holiday will clear the recorded entries for this date only before the
            zero-capacity day is saved.
          </p>
          <div className="rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)">
            {(holidayConfirmationState?.details ?? []).map((detail) => (
              <p key={detail}>{detail}</p>
            ))}
          </div>
          <div className="grid gap-3 sm:flex sm:justify-end">
            <Button
              className="w-full sm:w-auto"
              variant="secondary"
              onClick={() => setHolidayConfirmationState(null)}
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                holidayConfirmationState
                  ? void handleCalendarSelection(
                      holidayConfirmationState.workDate,
                      "HOLIDAY",
                      true,
                    )
                  : undefined
              }
            >
              Confirm holiday
            </Button>
          </div>
        </div>
      </Modal>

      <Card className="space-y-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-(--color-text-muted)">
              Monthly timesheet
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-(--color-text) sm:text-4xl">
              {timesheet.monthLabel}
            </h2>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Badge tone={timesheet.status}>{timesheet.status.replaceAll("_", " ")}</Badge>
              {timesheet.editWindowClosesAt ? (
                <span className="text-sm text-(--color-text-muted)">
                  Edit window closes on {formatDisplayDate(timesheet.editWindowClosesAt)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {windowTimesheets.map((item) => (
              <GlobalLoaderLink
                key={item.id}
                href={`/timesheets/${item.id}`}
                loaderMessage="Loading timesheet..."
                className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  item.id === timesheet.id
                    ? "border-amber-300 bg-amber-300 text-stone-950"
                    : "border-(--color-border-strong) bg-(--color-surface) text-(--color-text-subtle) hover:bg-(--color-surface-raised)"
                }`}
              >
                {item.monthLabel}
              </GlobalLoaderLink>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-dashed border-(--color-border-strong) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-muted)">
            Assigned hours now come from per-date capacity. Weekends, system holidays,
            full-day leave, half-day leave, and Holidays all affect the total
            automatically.
          </div>
          <div className="rounded-[24px] border border-(--color-border) bg-(--color-surface) px-4 py-4 text-sm text-(--color-text-subtle)">
            <p className="font-semibold text-(--color-text)">Date-state summary</p>
            <p className="mt-2">Full-day leave: {dateStateSummary.fullDayLeaves}</p>
            <p>Half-day leave: {dateStateSummary.halfDayLeaves}</p>
            <p>Holidays: {dateStateSummary.manualHolidays}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-left transition dark:hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:ring-offset-2"
          aria-controls="timesheet-calendar-panel"
          aria-expanded={isCalendarExpanded}
          onClick={() => setIsCalendarExpanded((current) => !current)}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--color-text-muted)">
              Calendar view
            </p>
            <p className="mt-2 text-sm text-(--color-text-muted)">
              {timesheet.monthLabel} - {selectableCalendarDayCount} active dates -{" "}
              {formatHoursValue(timesheet.assignedHours)} assigned hrs
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-(--color-text-subtle)">
            {isCalendarExpanded ? "Collapse" : "Expand"}
          </span>
        </button>

        {isCalendarExpanded ? (
          <div id="timesheet-calendar-panel" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
            {timesheet.calendarDays.map((day) => {
              const stateLabel = getCalendarStateLabel(day);
              const canSelectState = !readOnly && day.baseCapacityMinutes > 0;
              const recordedMinutes = dailyRecordedMinutes[day.workDate] ?? 0;
              const isFullyUtilized = isExactlyUtilized(
                recordedMinutes,
                day.capacityMinutes,
              );

              return (
                <div
                  key={day.workDate}
                  className={`rounded-[24px] border px-4 py-4 text-sm ${
                    isFullyUtilized
                      ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
                      : day.isSystemHoliday
                      ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
                      : day.isWeekend
                        ? "border-(--color-border) bg-(--color-surface-raised)"
                        : day.capacityMinutes === 0
                          ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                          : "border-(--color-border) bg-(--color-surface)"
                  }`}
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-(--color-text-muted)">
                    {formatDisplayDate(day.workDate)}
                  </p>
                  {canSelectState ? (
                    <Select
                      aria-label={`${formatDisplayDate(day.workDate)} day state`}
                      className="mt-2 border-0 bg-transparent px-0 py-0 pr-8 text-sm font-semibold text-(--color-text) shadow-none focus:border-0 focus:ring-0 dark:[color-scheme:dark]"
                      value={toCalendarSelection(day)}
                      disabled={calendarSavingDate === day.workDate}
                      onChange={(event) =>
                        void handleCalendarSelection(
                          day.workDate,
                          event.target.value as CalendarSelection,
                        )
                      }
                    >
                      <option value="NONE">Working Day</option>
                      <option value="HALF_DAY">Half Day Leave</option>
                      <option value="FULL_DAY">Full Day Leave</option>
                      <option value="HOLIDAY">Holiday</option>
                    </Select>
                  ) : (
                    <p className="mt-2 font-semibold text-(--color-text)">{stateLabel}</p>
                  )}
                  <p className="mt-1 text-(--color-text-muted)">
                    {day.capacityMinutes === 0
                      ? "-"
                      : `Utilization: ${formatDayUtilization(
                          recordedMinutes,
                          day.capacityMinutes,
                        )}`}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

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
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              }`}
              onClick={() => setActiveView(tab.key)}
            >
              {tab.label}
            </button>
          ))}
      </div>

      <div className="sticky top-3 z-20">
        <div className="rounded-[24px] border border-(--color-border) bg-(--color-surface)/95 px-4 py-3 shadow-[0_18px_40px_-28px_rgba(17,17,17,0.35)] backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-(--color-text-muted)">
                Progress
              </p>
              <div className="mt-2">
                <ProgressBar value={completionPercentage} />
              </div>
            </div>
            <p className="shrink-0 text-sm font-semibold text-(--color-text)">
              {formatHoursValue(totalHours)} / {formatHoursValue(timesheet.assignedHours)} hrs
            </p>
          </div>
        </div>
      </div>

      {activeView === "week" ? (
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-(--color-text)">Week allocation</h3>
              <p className="mt-1 text-sm text-(--color-text-muted)">
                Allocate one sub-program across the selected Mon-Fri week segment using
                10-minute resolution.
              </p>
            </div>
            {!readOnly ? (
              <Button className="w-full sm:w-auto" onClick={addWeekForm}>
                Add entry
              </Button>
            ) : null}
          </div>
          <div className="space-y-4">
            {weekForms.map((weekForm, index) => (
              <div
                key={weekForm.id}
                className="rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">
                    Allocation {index + 1}
                  </p>
                  {!readOnly && weekForms.length > 1 ? (
                    <Button variant="ghost" onClick={() => removeWeekForm(weekForm.id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-(--color-text-subtle)">
                    Week
                    <Select
                      className="mt-2"
                      value={weekForm.weekStartDate || weekOptions[0]?.weekStartDate || ""}
                      onChange={(event) =>
                        updateWeekForm(weekForm.id, "weekStartDate", event.target.value)
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
                  <label className="text-sm font-medium text-(--color-text-subtle)">
                    Sub-program
                    <Select
                      className="mt-2"
                      value={weekForm.projectId}
                      onChange={(event) =>
                        updateWeekForm(weekForm.id, "projectId", event.target.value)
                      }
                    >
                      {availableProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-sm font-medium text-(--color-text-subtle)">
                    Total hours
                    <Input
                      className="mt-2"
                      type="number"
                      step="any"
                      min={0}
                      value={weekForm.totalHours}
                      onChange={(event) =>
                        updateWeekForm(weekForm.id, "totalHours", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-(--color-text-subtle) md:col-span-2">
                    Description
                    <Textarea
                      className="mt-2"
                      rows={4}
                      value={weekForm.description}
                      onChange={(event) =>
                        updateWeekForm(weekForm.id, "description", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => void handleWeekApply(weekForm)}
                    disabled={readOnly || !timesheet.viewAvailability.week}
                  >
                    Apply week allocation
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {activeView === "month" ? (
        <Card className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-(--color-text)">Month allocation</h3>
              <p className="mt-1 text-sm text-(--color-text-muted)">
                Allocate one sub-program across all valid dates in the month. The result is
                written back as day-level rows.
              </p>
            </div>
            {!readOnly ? (
              <Button className="w-full sm:w-auto" onClick={addMonthForm}>
                Add entry
              </Button>
            ) : null}
          </div>
          <div className="space-y-4">
            {monthForms.map((monthForm, index) => (
              <div
                key={monthForm.id}
                className="rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">
                    Allocation {index + 1}
                  </p>
                  {!readOnly && monthForms.length > 1 ? (
                    <Button variant="ghost" onClick={() => removeMonthForm(monthForm.id)}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-(--color-text-subtle)">
                    Sub-program
                    <Select
                      className="mt-2"
                      value={monthForm.projectId}
                      onChange={(event) =>
                        updateMonthForm(monthForm.id, "projectId", event.target.value)
                      }
                    >
                      {availableProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.code} - {project.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-sm font-medium text-(--color-text-subtle)">
                    Total hours
                    <Input
                      className="mt-2"
                      type="number"
                      step="any"
                      min={0}
                      value={monthForm.totalHours}
                      onChange={(event) =>
                        updateMonthForm(monthForm.id, "totalHours", event.target.value)
                      }
                    />
                  </label>
                  <label className="text-sm font-medium text-(--color-text-subtle) md:col-span-2">
                    Description
                    <Textarea
                      className="mt-2"
                      rows={4}
                      value={monthForm.description}
                      onChange={(event) =>
                        updateMonthForm(monthForm.id, "description", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => void handleMonthApply(monthForm)}
                    disabled={readOnly || !timesheet.viewAvailability.month}
                  >
                    Apply month allocation
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {activeView === "day" ? (
        <Card className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-(--color-text)">Day view</h3>
              <p className="mt-1 text-sm text-(--color-text-muted)">
                Day View remains the source of truth. Decimal hours are normalized to the
                nearest valid 10-minute increment.
              </p>
            </div>
            {!readOnly ? (
              <Button className="w-full sm:w-auto" onClick={addEntry}>
                Add entry
              </Button>
            ) : null}
          </div>

          <div className="space-y-4 md:hidden">
            {draft.entries.map((entry, index) => (
              <div
                key={getEntryKey(entry)}
                className={`rounded-[28px] border border-(--color-border) bg-(--color-surface-raised) p-4 ${getEntryAnimationClass(
                  entry,
                )}`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">
                      Entry {index + 1}
                    </p>
                    <p className="mt-1 text-sm text-(--color-text-muted)">{entry.entryType}</p>
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
                  <label className="text-sm font-medium text-(--color-text-subtle)">
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
                  <label className="text-sm font-medium text-(--color-text-subtle)">
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
                  <label className="text-sm font-medium text-(--color-text-subtle)">
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
                  <label className="text-sm font-medium text-(--color-text-subtle)">
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
                <tr className="text-left text-(--color-text-muted)">
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
                    className={`rounded-2xl bg-(--color-surface-raised) ${getEntryAnimationClass(entry)}`}
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
                    <td className="px-3 py-3 text-(--color-text-muted)">
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
              void runWithLoader({
                mode: "blocking",
                message: "Saving draft...",
                operation: async () => {
                  await autosave.saveNow();
                },
              }).catch((error) => {
                showError(error, "Unable to save the current draft.");
              });
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
        <GlobalLoaderLink
          href="/dashboard"
          loaderMessage="Returning to dashboard..."
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-(--color-border-strong) bg-(--color-surface) px-4 py-2 text-sm font-semibold text-(--color-text-subtle)"
        >
          Back to dashboard
        </GlobalLoaderLink>
      </div>
    </div>
  );
}
