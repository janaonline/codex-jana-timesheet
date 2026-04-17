import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { runAfterResponse } from "@/lib/background-task";
import { apiSuccess, readJson } from "@/lib/response";
import { env } from "@/lib/env";
import { requireString } from "@/lib/validators";
import { REQUEST_EDIT_REASON_LIMIT } from "@/lib/constants";
import { requestEdit } from "@/services/timesheet-service";
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
      runAfterResponse("request_edit_alert_emails", async () => {
        await Promise.all(
          result.approvers.map((approver) =>
            sendEditRequestAlertMessage({
              recipient: approver.email,
              approverName: approver.name,
              requesterName: result.timesheet.ownerName,
              requesterUserId: result.timesheet.userId,
              timesheetId: result.timesheet.id,
              monthLabel: result.timesheet.monthLabel,
              reason,
              reviewUrl: `${env.appBaseUrl}/admin/edit-requests`,
              timesheetUrl: `${env.appBaseUrl}/timesheets/${result.timesheet.id}`,
            }),
          ),
        );
      });

      return apiSuccess(result, { status: 201 });
    },
  });
}
