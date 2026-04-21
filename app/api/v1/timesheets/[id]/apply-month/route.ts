import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { TIMESHEET_OWNER_ROLES } from "@/lib/constants";
import { apiSuccess, readJson } from "@/lib/response";
import { requireInteger, requireNumber, requireString } from "@/lib/validators";
import { applyMonthAllocation } from "@/services/timesheet-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: [...TIMESHEET_OWNER_ROLES],
    requireOriginCheck: true,
    actionName: "apply_timesheet_month_allocation",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as {
        version?: number;
        projectId?: string;
        totalHours?: number;
        description?: string;
        confirmOverwrite?: boolean;
      };

      return apiSuccess(
        await applyMonthAllocation({
          timesheetId: id,
          actor: {
            userId: session!.user.id,
            role: session!.user.role as UserRole,
          },
          version: requireInteger(body.version, "version"),
          projectId: requireString(body.projectId, "projectId"),
          totalHours: requireNumber(body.totalHours, "totalHours"),
          description: requireString(body.description, "description"),
          confirmOverwrite: Boolean(body.confirmOverwrite),
        }),
      );
    },
  });
}
