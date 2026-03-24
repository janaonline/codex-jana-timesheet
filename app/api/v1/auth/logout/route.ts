import { apiSuccess } from "@/lib/response";
import { handlePublicApiRoute } from "@/lib/api-route";

export async function POST(request: Request) {
  return handlePublicApiRoute(request, "auth_logout_endpoint", async () =>
    apiSuccess({
      logoutUrl: "/api/auth/signout",
      callbackUrl: "/login",
    }),
  );
}
