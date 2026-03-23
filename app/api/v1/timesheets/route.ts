import { handleApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import {
  createTimesheetForUser,
  listTimesheetsForUser,
} from "@/services/timesheet-service";

export async function GET(request: Request) {
  return handleApiRoute(request, {
    actionName: "list_timesheets",
    handler: async (session) =>
      apiSuccess(await listTimesheetsForUser(session!.user.id)),
  });
}

export async function POST(request: Request) {
  return handleApiRoute(request, {
    roles: ["PROGRAM_HEAD"],
    requireOriginCheck: true,
    actionName: "create_timesheet",
    handler: async (session) => {
      const body = await readJson(request);
      const monthKey = requireString((body as { monthKey?: string }).monthKey, "monthKey");

      return apiSuccess(
        await createTimesheetForUser(session!.user.id, monthKey),
        { status: 201 },
      );
    },
  });
}
