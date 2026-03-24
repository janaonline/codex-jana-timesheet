import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import { listPendingEditRequests } from "@/services/timesheet-service";
import { getMonthLabel } from "@/lib/time";

export async function GET(request: Request) {
  return handleApiRoute(request, {
    permission: "edit-requests:review",
    actionName: "list_edit_requests",
    handler: async () => {
      const requests = await listPendingEditRequests();
      return apiSuccess(
        requests.map((request) => ({
          id: request.id,
          requesterName: request.requestedBy.name,
          requesterEmail: request.requestedBy.email,
          monthLabel: getMonthLabel(request.timesheet.monthKey),
          status: request.status,
          reason: request.reason,
          requestedAt: request.requestedAt.toISOString(),
          timesheetId: request.timesheetId,
        })),
      );
    },
  });
}
