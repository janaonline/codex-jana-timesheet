import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import {
  approveEditRequest,
  getTimesheetEmailContext,
} from "@/services/timesheet-service";
import { sendEditDecisionMessage } from "@/services/email-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    permission: "edit-requests:review",
    requireOriginCheck: true,
    actionName: "approve_edit_request",
    handler: async (session) => {
      const { id } = await context.params;
      const result = await approveEditRequest({
        editRequestId: id,
        approverUserId: session!.user.id,
      });

      const emailContext = await getTimesheetEmailContext(result.timesheet.id);
      await sendEditDecisionMessage({
        recipient: emailContext.view.ownerEmail,
        userName: emailContext.view.ownerName,
        userId: emailContext.view.userId,
        timesheetId: emailContext.view.id,
        monthLabel: emailContext.view.monthLabel,
        approved: true,
        editableUntil: result.request.editableUntil,
        timesheetUrl: emailContext.timesheetUrl,
      });

      return apiSuccess(result);
    },
  });
}
