import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireArray, requireInteger } from "@/lib/validators";
import {
  getTimesheetForActor,
  saveDraftTimesheet,
} from "@/services/timesheet-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    actionName: "get_timesheet",
    handler: async (session) => {
      const { id } = await context.params;
      return apiSuccess(
        await getTimesheetForActor(id, {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        }),
      );
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "save_timesheet_draft",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as {
        leaveDays?: number;
        version?: number;
        entries?: Array<{
          id?: string;
          workDate: string;
          projectId: string;
          hours: number;
          description?: string;
        }>;
      };

      const result = await saveDraftTimesheet({
        timesheetId: id,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        leaveDays: requireInteger(body.leaveDays, "leaveDays"),
        version: requireInteger(body.version, "version"),
        entries: requireArray(body.entries, "entries"),
      });

      return apiSuccess(result);
    },
  });
}
