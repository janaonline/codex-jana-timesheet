import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireNumber, requireString } from "@/lib/validators";
import {
  getTimesheetForActor,
  saveDraftTimesheet,
} from "@/services/timesheet-service";

async function getEntryTimesheetId(entryId: string) {
  const entry = await prisma.timesheetEntry.findUnique({
    where: { id: entryId },
    select: { id: true, timesheetId: true },
  });

  if (!entry) {
    throw new Error("Timesheet entry not found.");
  }

  return entry.timesheetId;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "update_timesheet_entry",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as {
        workDate?: string;
        projectId?: string;
        hours?: number;
        description?: string;
      };
      const timesheetId = await getEntryTimesheetId(id);
      const current = await getTimesheetForActor(timesheetId, {
        userId: session!.user.id,
        role: session!.user.role as UserRole,
      });

      const result = await saveDraftTimesheet({
        timesheetId,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        leaveDays: current.timesheet.leaveDays,
        version: current.timesheet.version,
        entries: current.timesheet.entries.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                workDate: requireString(body.workDate, "workDate"),
                projectId: requireString(body.projectId, "projectId"),
                hours: requireNumber(body.hours, "hours"),
                description: body.description ?? "",
              }
            : entry,
        ),
      });

      return apiSuccess(result);
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "delete_timesheet_entry",
    handler: async (session) => {
      const { id } = await context.params;
      const timesheetId = await getEntryTimesheetId(id);
      const current = await getTimesheetForActor(timesheetId, {
        userId: session!.user.id,
        role: session!.user.role as UserRole,
      });

      const result = await saveDraftTimesheet({
        timesheetId,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        leaveDays: current.timesheet.leaveDays,
        version: current.timesheet.version,
        entries: current.timesheet.entries.filter((entry) => entry.id !== id),
      });

      return apiSuccess(result);
    },
  });
}
