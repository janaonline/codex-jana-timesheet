import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import { REQUEST_EDIT_REASON_LIMIT } from "@/lib/constants";
import {
  getTimesheetEmailContext,
  requestEdit,
} from "@/services/timesheet-service";
import { sendEditRequestAlertMessage } from "@/services/email-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "request_timesheet_edit",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as { reason?: string };
      const reason = requireString(
        body.reason,
        "reason",
        REQUEST_EDIT_REASON_LIMIT,
      );

      const result = await requestEdit({
        timesheetId: id,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        reason,
      });

      const emailContext = await getTimesheetEmailContext(id);
      await Promise.all(
        result.approvers.map((approver) =>
          sendEditRequestAlertMessage({
            recipient: approver.email,
            approverName: approver.name,
            requesterName: emailContext.view.ownerName,
            requesterUserId: emailContext.view.userId,
            timesheetId: emailContext.view.id,
            monthLabel: emailContext.view.monthLabel,
            reason,
            reviewUrl: emailContext.reviewUrl,
            timesheetUrl: emailContext.timesheetUrl,
          }),
        ),
      );

      return apiSuccess(result, { status: 201 });
    },
  });
}
