import { handleApiRoute } from "@/lib/api-route";
import { getHomePathForRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import { setPasswordForUser } from "@/services/auth-service";

export async function POST(request: Request) {
  return handleApiRoute(request, {
    requireOriginCheck: true,
    allowPendingPasswordSetup: true,
    actionName: "set_password",
    handler: async (session) => {
      const body = (await readJson(request)) as {
        password?: string;
        confirmPassword?: string;
      };

      const password = requireString(body.password, "password");
      const confirmPassword = requireString(body.confirmPassword, "confirmPassword");

      if (password !== confirmPassword) {
        throw new AppError("PASSWORD_MISMATCH", 400, "Passwords do not match.");
      }

      const user = await setPasswordForUser({
        userId: session!.user.id,
        password,
      });

      return apiSuccess({
        user,
        redirectUrl: getHomePathForRole(user.role),
      });
    },
  });
}
