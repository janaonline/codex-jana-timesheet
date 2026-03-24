import { getAppSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { apiSuccess } from "@/lib/response";
import { handlePublicApiRoute } from "@/lib/api-route";

export async function GET(request: Request) {
  return handlePublicApiRoute(request, "auth_session_endpoint", async () => {
    const session = await getAppSession();
    return apiSuccess({
      authMode: env.authMode,
      session: session?.user
        ? {
            user: session.user,
            expiresByInactivity: session.expiresByInactivity ?? false,
          }
        : null,
    });
  });
}
