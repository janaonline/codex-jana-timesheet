"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { Input } from "@/components/common/input";
import { ProgressBar } from "@/components/common/progress-bar";
import { Select } from "@/components/common/select";
import { Textarea } from "@/components/common/textarea";
import { useToast } from "@/components/common/toast-provider";
import { useAutosave } from "@/hooks/use-autosave";
import { calculateAssignedHoursFromWorkingDays } from "@/lib/timesheet-calculations";
import { formatDisplayDate } from "@/lib/time";
import type { TimesheetView } from "@/services/timesheet-service";
import { RequestEditModal } from "@/components/timesheets/request-edit-modal";

type EditorEntry = TimesheetView["entries"][number] & {
  localId: string;
};

type EditorState = {
  id: string;
  leaveDays: number;
  version: number;
  entries: EditorEntry[];
};

function normalizeEditorState(timesheet: TimesheetView): EditorState {
  return {
    id: timesheet.id,
    leaveDays: timesheet.leaveDays,
    version: timesheet.version,
    entries: timesheet.entries.map((entry) => ({
      ...entry,
      localId: entry.id,
    })),
  };
}

function getStoredDraftState(timesheetId: string, fallback: EditorState) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const rawValue = localStorage.getItem(`timesheet-draft:${timesheetId}`);
    if (!rawValue) {
      return fallback;
    }

    const parsed = JSON.parse(rawValue) as { payload: EditorState; updatedAt: string };
    return parsed.payload.version >= fallback.version ? parsed.payload : fallback;
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
  const payload = (await response.json()) as
    | { ok: true; data: T }
    | { ok: false; error: { message: string; details?: string[] } };

  if (!response.ok || !payload.ok) {
    throw new Error(
      !payload.ok && payload.error.details?.length
        ? payload.error.details.join(" ")
        : !payload.ok
          ? payload.error.message
          : "Request failed.",
    );
  }

  return payload.data;
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
  const [timesheet, setTimesheet] = useState(initialTimesheet);
  const [draft, setDraft] = useState<EditorState>(() =>
    getStoredDraftState(
      initialTimesheet.id,
      normalizeEditorState(initialTimesheet),
    ),
  );
  const [requestEditOpen, setRequestEditOpen] = useState(false);

  const assignedHours = calculateAssignedHoursFromWorkingDays(
    timesheet.workingDaysCount,
    draft.leaveDays,
  );
  const totalHours = Number(
    draft.entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0).toFixed(2),
  );
  const completionPercentage =
    assignedHours > 0 ? Number(((totalHours / assignedHours) * 100).toFixed(2)) : 0;
  const remainingHours = Math.max(0, Number((assignedHours - totalHours).toFixed(2)));
  const isExactlyComplete =
    assignedHours > 0 && Number(totalHours.toFixed(2)) === Number(assignedHours.toFixed(2));

  const autosave = useAutosave({
    storageKey: `timesheet-draft:${timesheet.id}`,
    value: draft,
    async onSave(currentValue) {
      const result = await postJson<{
        timesheet: TimesheetView;
      }>(`/api/v1/timesheets/${timesheet.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          leaveDays: currentValue.leaveDays,
          version: currentValue.version,
          entries: currentValue.entries.map((entry) => ({
            id: entry.id.startsWith("temp-") ? undefined : entry.id,
            workDate: entry.workDate,
            projectId: entry.projectId,
            hours: Number(entry.hours),
            description: entry.description,
          })),
        }),
      });

      return normalizeEditorState(result.timesheet);
    },
    onSaved(savedValue) {
      setDraft(savedValue);
      startTransition(() => {
        setTimesheet((current) => ({
          ...current,
          leaveDays: savedValue.leaveDays,
          version: savedValue.version,
          entries: savedValue.entries.map((entry) => ({
            id: entry.id,
            workDate: entry.workDate,
            projectId: entry.projectId,
            projectCode: entry.projectCode,
            projectName: entry.projectName,
            hours: entry.hours,
            description: entry.description,
          })),
          totalHours,
          completionPercentage,
          remainingHours,
          assignedHours,
        }));
      });
    },
  });

  function updateEntry(localId: string, field: keyof EditorEntry, value: string | number) {
    setDraft((current) => ({
      ...current,
      entries: current.entries.map((entry) =>
        entry.localId === localId
          ? {
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
            }
          : entry,
      ),
    }));
  }

  function addEntry() {
    const firstProject = availableProjects[0];
    const tempId = `temp-${crypto.randomUUID()}`;
    setDraft((current) => ({
      ...current,
      entries: [
        ...current.entries,
        {
          id: tempId,
          localId: tempId,
          workDate: `${timesheet.monthKey}-01`,
          projectId: firstProject?.id ?? "",
          projectCode: firstProject?.code ?? "",
          projectName: firstProject?.name ?? "",
          hours: 0.25,
          description: "",
        },
      ],
    }));
  }

  function deleteEntry(localId: string) {
    setDraft((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.localId !== localId),
    }));
  }

  async function handleSubmit() {
    try {
      await autosave.saveNow();
      await postJson(`/api/v1/timesheets/${timesheet.id}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      pushToast({ title: "Timesheet submitted successfully.", tone: "success" });
      router.push(`/timesheets/${timesheet.id}/confirmation`);
      router.refresh();
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : "Submission failed.",
        tone: "error",
      });
    }
  }

  async function handleRequestEdit(reason: string) {
    try {
      await postJson(`/api/v1/timesheets/${timesheet.id}/edit-request`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      pushToast({ title: "Edit request submitted.", tone: "success" });
      setRequestEditOpen(false);
      router.refresh();
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : "Edit request failed.",
        tone: "error",
      });
    }
  }

  const readOnly = !timesheet.isEditable;

  return (
    <div className="space-y-6">
      <RequestEditModal
        open={requestEditOpen}
        onClose={() => setRequestEditOpen(false)}
        onSubmit={handleRequestEdit}
      />

      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-stone-500">
              Monthly timesheet
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-stone-950">
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
          <div className="flex flex-wrap gap-3">
            {windowTimesheets.map((item) => (
              <Link
                key={item.id}
                href={`/timesheets/${item.id}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  item.id === timesheet.id
                    ? "bg-stone-950 text-white"
                    : "border border-stone-300 bg-white text-stone-700"
                }`}
              >
                {item.monthLabel}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="bg-stone-950 text-white">
            <p className="text-xs uppercase tracking-[0.26em] text-stone-300">Recorded hours</p>
            <p className="mt-3 text-3xl font-semibold">{totalHours}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Assigned hours</p>
            <p className="mt-3 text-3xl font-semibold text-stone-950">{assignedHours}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Remaining hours</p>
            <p className="mt-3 text-3xl font-semibold text-stone-950">{remainingHours}</p>
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
            {autosave.lastSavedAt ? (
              <p className="mt-1 text-sm text-stone-500">
                Last saved at {new Date(autosave.lastSavedAt).toLocaleTimeString("en-IN")}
              </p>
            ) : null}
          </Card>
        </div>

        <ProgressBar value={completionPercentage} label={`Completion: ${completionPercentage}%`} />
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Number of leaves
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={draft.leaveDays}
              disabled={readOnly}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  leaveDays: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
            Working days are derived in IST using the holiday calendar, join date, and exit
            date. Assigned hours follow the confirmed rule:
            <span className="font-semibold text-stone-900">
              {" "}
              (working days x 8) - (leaves x 8)
            </span>
            .
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-stone-950">Daily breakdown</h3>
            <p className="mt-1 text-sm text-stone-600">
              Hours must be recorded in 0.25 increments and daily totals cannot exceed 24.
            </p>
          </div>
          {!readOnly ? <Button onClick={addEntry}>Add entry</Button> : null}
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-3 text-sm">
            <thead>
              <tr className="text-left text-stone-500">
                <th className="px-3">Date</th>
                <th className="px-3">Sub-program</th>
                <th className="px-3">Hours</th>
                <th className="px-3">Description</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {draft.entries.map((entry) => (
                <tr key={entry.localId} className="rounded-2xl bg-stone-50">
                  <td className="px-3 py-3">
                    <Input
                      type="date"
                      value={entry.workDate}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateEntry(entry.localId, "workDate", event.target.value)
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Select
                      value={entry.projectId}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateEntry(entry.localId, "projectId", event.target.value)
                      }
                    >
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
                      min={0.25}
                      max={24}
                      step={0.25}
                      value={entry.hours}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateEntry(entry.localId, "hours", Number(event.target.value))
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Textarea
                      rows={2}
                      value={entry.description}
                      disabled={readOnly}
                      onChange={(event) =>
                        updateEntry(entry.localId, "description", event.target.value)
                      }
                      placeholder="Required before final submission"
                    />
                  </td>
                  <td className="px-3 py-3">
                    {!readOnly ? (
                      <Button variant="ghost" onClick={() => deleteEntry(entry.localId)}>
                        Remove
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        {!readOnly ? (
          <Button variant="secondary" onClick={() => autosave.saveNow()}>
            Save draft
          </Button>
        ) : null}
        {!readOnly && isExactlyComplete ? (
          <Button onClick={handleSubmit}>Submit timesheet</Button>
        ) : null}
        {timesheet.canRequestEdit ? (
          <Button variant="secondary" onClick={() => setRequestEditOpen(true)}>
            Request edit
          </Button>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
