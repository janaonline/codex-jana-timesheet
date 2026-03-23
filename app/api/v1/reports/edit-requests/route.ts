import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess } from "@/lib/response";
import { getEditRequestReport } from "@/services/report-service";

export async function GET(request: Request) {
  return handleApiRoute(request, {
    roles: ["ADMIN", "OPERATIONS"],
    actionName: "get_edit_request_report",
    handler: async () => apiSuccess(await getEditRequestReport()),
  });
}
