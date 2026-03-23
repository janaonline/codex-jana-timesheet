import type { Session } from "next-auth";

import { requireApiSession } from "@/lib/auth";
import {
  DEFAULT_RATE_LIMIT,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  type UserRole,
} from "@/lib/constants";
import { env } from "@/lib/env";
import { captureError } from "@/lib/observability";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiError, assertTrustedOrigin } from "@/lib/response";

function getRateLimitKey(request: Request, session: Session | null) {
  return (
    session?.user?.id ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}

export async function handleApiRoute<T>(
  request: Request,
  options: {
    roles?: UserRole[];
    requireOriginCheck?: boolean;
    actionName: string;
    handler: (session: Session | null) => Promise<T>;
  },
) {
  try {
    if (options.requireOriginCheck) {
      assertTrustedOrigin(request, env.appBaseUrl);
    }

    const session = options.roles
      ? await requireApiSession(options.roles)
      : await requireApiSession();

    enforceRateLimit(
      getRateLimitKey(request, session),
      DEFAULT_RATE_LIMIT,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
    );

    return await options.handler(session);
  } catch (error) {
    await captureError(options.actionName, error);
    return apiError(error);
  }
}

export async function handlePublicApiRoute<T>(
  request: Request,
  actionName: string,
  handler: () => Promise<T>,
) {
  try {
    enforceRateLimit(
      getRateLimitKey(request, null),
      DEFAULT_RATE_LIMIT,
      DEFAULT_RATE_LIMIT_WINDOW_MS,
    );

    return await handler();
  } catch (error) {
    await captureError(actionName, error);
    return apiError(error);
  }
}
