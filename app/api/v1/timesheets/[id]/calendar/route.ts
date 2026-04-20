import type { UserRole } from "@prisma/client";

import { LEAVE_TYPES, TIMESHEET_OWNER_ROLES } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireArray, requireInteger, requireString } from "@/lib/validators";
import { updateTimesheetCalendar } from "@/services/timesheet-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: [...TIMESHEET_OWNER_ROLES],
    requireOriginCheck: true,
    actionName: "update_timesheet_calendar",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as {
        version?: number;
        updates?: Array<{
          workDate?: string;
          leaveType?: string;
          isManualHoliday?: boolean;
          isPersonalNonWorkingDay?: boolean;
          confirmEntryClear?: boolean;
        }>;
      };

      const updates = requireArray<{
        workDate?: string;
        leaveType?: string;
        isManualHoliday?: boolean;
        isPersonalNonWorkingDay?: boolean;
        confirmEntryClear?: boolean;
      }>(body.updates, "updates").map((update, index) => {
        const leaveType = requireString(update.leaveType, `updates[${index}].leaveType`);
        if (!LEAVE_TYPES.includes(leaveType as (typeof LEAVE_TYPES)[number])) {
          throw new AppError("VALIDATION_ERROR", 400, "Invalid leave type.");
        }

        return {
          workDate: requireString(update.workDate, `updates[${index}].workDate`),
          leaveType: leaveType as (typeof LEAVE_TYPES)[number],
          isManualHoliday: Boolean(
            update.isManualHoliday ?? update.isPersonalNonWorkingDay,
          ),
          confirmEntryClear: Boolean(update.confirmEntryClear),
        };
      });

      return apiSuccess(
        await updateTimesheetCalendar({
          timesheetId: id,
          actor: {
            userId: session!.user.id,
            role: session!.user.role as UserRole,
          },
          version: requireInteger(body.version, "version"),
          updates,
        }),
      );
    },
  });
}
