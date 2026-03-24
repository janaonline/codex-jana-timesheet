import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import { getHoursUtilizationReport } from "@/services/report-service";

export async function GET(request: Request) {
  return handleApiRoute(request, {
    permission: "reports:read:admin",
    actionName: "get_hours_utilization_report",
    handler: async () => {
      const monthKey = new URL(request.url).searchParams.get("monthKey") ?? undefined;
      return apiSuccess(await getHoursUtilizationReport(monthKey));
    },
  });
}
