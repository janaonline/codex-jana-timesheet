import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireNumber, requireString } from "@/lib/validators";
import {
  getTimesheetForActor,
  saveDraftTimesheet,
} from "@/services/timesheet-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "create_timesheet_entry",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as {
        workDate?: string;
        projectId?: string;
        hours?: number;
        description?: string;
      };

      const current = await getTimesheetForActor(id, {
        userId: session!.user.id,
        role: session!.user.role as UserRole,
      });

      const result = await saveDraftTimesheet({
        timesheetId: id,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        leaveDays: current.timesheet.leaveDays,
        version: current.timesheet.version,
        entries: [
          ...current.timesheet.entries,
          {
            workDate: requireString(body.workDate, "workDate"),
            projectId: requireString(body.projectId, "projectId"),
            hours: requireNumber(body.hours, "hours"),
            description: body.description ?? "",
          },
        ],
      });

      return apiSuccess(result, { status: 201 });
    },
  });
}
