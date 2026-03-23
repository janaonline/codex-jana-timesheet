import { env } from "@/lib/env";
import { apiError, apiSuccess } from "@/lib/response";
import { requireApiSession } from "@/lib/auth";
import { captureError } from "@/lib/observability";
import { runAutoSubmitJob } from "@/services/job-service";

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-job-secret");
    if (secret !== env.cronJobSharedSecret) {
      await requireApiSession(["ADMIN", "OPERATIONS"]);
    }

    return apiSuccess(await runAutoSubmitJob(new Date()));
  } catch (error) {
    await captureError("run_auto_submit_job", error);
    return apiError(error);
  }
}
