import type { UserRole } from "@prisma/client";

import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import {
  getTimesheetEmailContext,
  submitTimesheet,
} from "@/services/timesheet-service";
import { sendSubmissionConfirmationMessage } from "@/services/email-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "submit_timesheet",
    handler: async (session) => {
      const { id } = await context.params;
      const result = await submitTimesheet({
        timesheetId: id,
        actor: {
          userId: session!.user.id,
          role: session!.user.role as UserRole,
        },
        method: "manual",
      });

      const emailContext = await getTimesheetEmailContext(id);
      await sendSubmissionConfirmationMessage({
        recipient: emailContext.view.ownerEmail,
        userName: emailContext.view.ownerName,
        userId: emailContext.view.userId,
        timesheetId: emailContext.view.id,
        monthLabel: emailContext.view.monthLabel,
        submissionTimestamp: new Date().toISOString(),
        submissionMethod: "manual",
        totalHoursRecorded: result.totalHoursRecorded,
        breakdownHtml: result.breakdownHtml,
        requestEditUrl: emailContext.requestEditUrl,
      });

      return apiSuccess(result);
    },
  });
}
