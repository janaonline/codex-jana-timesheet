import { handleApiRoute } from "@/lib/api-route";
import { runAfterResponse } from "@/lib/background-task";
import { apiSuccess } from "@/lib/response";
import { env } from "@/lib/env";
import { approveEditRequest } from "@/services/timesheet-service";
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
      runAfterResponse("approve_edit_request_email", async () => {
        await sendEditDecisionMessage({
          recipient: result.timesheet.ownerEmail,
          userName: result.timesheet.ownerName,
          userId: result.timesheet.userId,
          timesheetId: result.timesheet.id,
          monthLabel: result.timesheet.monthLabel,
          approved: true,
          editableUntil: result.request.editableUntil,
          timesheetUrl: `${env.appBaseUrl}/timesheets/${result.timesheet.id}`,
        });
      });

      return apiSuccess(result);
    },
  });
}
