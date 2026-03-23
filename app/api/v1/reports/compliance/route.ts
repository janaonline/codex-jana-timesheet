import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import { getComplianceReport } from "@/services/report-service";

export async function GET(request: Request) {
  return handleApiRoute(request, {
    roles: ["ADMIN", "OPERATIONS"],
    actionName: "get_compliance_report",
    handler: async () => {
      const monthKey = new URL(request.url).searchParams.get("monthKey") ?? undefined;
      return apiSuccess(await getComplianceReport(monthKey));
    },
  });
}
