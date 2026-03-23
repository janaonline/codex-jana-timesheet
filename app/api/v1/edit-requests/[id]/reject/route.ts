import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import { REQUEST_EDIT_REASON_LIMIT } from "@/lib/constants";
import {
  getTimesheetEmailContext,
  rejectEditRequest,
} from "@/services/timesheet-service";
import { sendEditDecisionMessage } from "@/services/email-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["ADMIN", "OPERATIONS"],
    requireOriginCheck: true,
    actionName: "reject_edit_request",
    handler: async (session) => {
      const { id } = await context.params;
      const body = (await readJson(request)) as { reason?: string };
      const reason = requireString(body.reason, "reason", REQUEST_EDIT_REASON_LIMIT);

      const result = await rejectEditRequest({
        editRequestId: id,
        approverUserId: session!.user.id,
        reason,
      });

      const emailContext = await getTimesheetEmailContext(result.timesheet.id);
      await sendEditDecisionMessage({
        recipient: emailContext.view.ownerEmail,
        userName: emailContext.view.ownerName,
        userId: emailContext.view.userId,
        timesheetId: emailContext.view.id,
        monthLabel: emailContext.view.monthLabel,
        approved: false,
        rejectionReason: reason,
        timesheetUrl: emailContext.timesheetUrl,
      });

      return apiSuccess(result);
    },
  });
}
