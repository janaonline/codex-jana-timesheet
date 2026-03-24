import { handlePublicApiRoute } from "@/lib/api-route";
import { OTP_PURPOSES } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import { requestOtpChallenge } from "@/services/auth-service";

function getRequesterKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "public"
  );
}

export async function POST(request: Request) {
  return handlePublicApiRoute(
    request,
    "request_otp",
    async () => {
      const body = (await readJson(request)) as {
        email?: string;
        purpose?: string;
      };

      const purpose = requireString(body.purpose, "purpose");
      if (!OTP_PURPOSES.includes(purpose as (typeof OTP_PURPOSES)[number])) {
        throw new AppError("VALIDATION_ERROR", 400, "Invalid OTP purpose.");
      }

      return apiSuccess(
        await requestOtpChallenge({
          email: requireString(body.email, "email"),
          purpose: purpose as (typeof OTP_PURPOSES)[number],
          requesterKey: getRequesterKey(request),
        }),
      );
    },
    {
      requireOriginCheck: true,
    },
  );
}
