import { API_VERSION_PREFIX } from "@/lib/constants";
import { env } from "@/lib/env";
import { apiSuccess } from "@/lib/response";
import { handlePublicApiRoute } from "@/lib/api-route";

export async function POST(request: Request) {
  return handlePublicApiRoute(request, "auth_login_endpoint", async () =>
    apiSuccess({
      authMode: env.authMode,
      loginUrl: "/login",
      callbackUrl: "/",
      activationUrl: "/login?view=activate",
      forgotPasswordUrl: "/login?view=forgot",
      apiPrefix: API_VERSION_PREFIX,
    }),
  );
}
