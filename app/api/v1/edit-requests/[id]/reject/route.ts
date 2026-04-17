import { handleApiRoute } from "@/lib/api-route";
import { runAfterResponse } from "@/lib/background-task";
import { apiSuccess, readJson } from "@/lib/response";
import { env } from "@/lib/env";
import { requireString } from "@/lib/validators";
import { REQUEST_EDIT_REASON_LIMIT } from "@/lib/constants";
import { rejectEditRequest } from "@/services/timesheet-service";
import { sendEditDecisionMessage } from "@/services/email-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    permission: "edit-requests:review",
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
      runAfterResponse("reject_edit_request_email", async () => {
        await sendEditDecisionMessage({
          recipient: result.timesheet.ownerEmail,
          userName: result.timesheet.ownerName,
          userId: result.timesheet.userId,
          timesheetId: result.timesheet.id,
          monthLabel: result.timesheet.monthLabel,
          approved: false,
          rejectionReason: reason,
          timesheetUrl: `${env.appBaseUrl}/timesheets/${result.timesheet.id}`,
        });
      });

      return apiSuccess(result);
    },
  });
}
