import type { UserRole } from "@prisma/client";

import { runAfterResponse } from "@/lib/background-task";
import { handleApiRoute } from "@/lib/api-route";
import { env } from "@/lib/env";
import { apiSuccess } from "@/lib/response";
import { submitTimesheet } from "@/services/timesheet-service";
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
      runAfterResponse("submit_timesheet_confirmation_email", async () => {
        await sendSubmissionConfirmationMessage({
          recipient: result.timesheet.ownerEmail,
          userName: result.timesheet.ownerName,
          userId: result.timesheet.userId,
          timesheetId: result.timesheet.id,
          monthLabel: result.timesheet.monthLabel,
          submissionTimestamp:
            result.timesheet.submittedAt ?? new Date().toISOString(),
          submissionMethod: "manual",
          totalHoursRecorded: result.totalHoursRecorded,
          breakdownHtml: result.breakdownHtml,
          requestEditUrl: `${env.appBaseUrl}/timesheets/${result.timesheet.id}`,
        });
      });

      return apiSuccess(result);
    },
  });
}
