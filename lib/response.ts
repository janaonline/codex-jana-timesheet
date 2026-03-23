import { NextResponse } from "next/server";

import { AppError, isAppError } from "@/lib/errors";

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true,
      data,
    },
    init,
  );
}

export function apiError(error: unknown) {
  const appError = isAppError(error)
    ? error
    : new AppError(
        "INTERNAL_SERVER_ERROR",
        500,
        "An unexpected error occurred.",
      );

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    },
    { status: appError.status },
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_JSON", 400, "Request body must be valid JSON.");
  }
}

export function assertTrustedOrigin(request: Request, allowedOrigin: string) {
  const origin = request.headers.get("origin");
  if (origin && origin !== allowedOrigin) {
    throw new AppError(
      "INVALID_ORIGIN",
      403,
      "Cross-site request rejected.",
    );
  }
}
