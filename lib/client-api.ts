"use client";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: {
    code?: string;
    message: string;
    details?: string[];
  };
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function buildApiClientError(
  payload: ApiSuccess<unknown> | ApiFailure | null,
  fallbackMessage: string,
) {
  if (payload && !payload.ok) {
    return new ApiClientError(
      payload.error.details?.length
        ? payload.error.details.join(" ")
        : payload.error.message || fallbackMessage,
      payload.error.code,
      payload.error.details,
    );
  }

  return new ApiClientError(fallbackMessage);
}

export async function parseJsonApiResponse<T>(
  response: Response,
  fallbackMessage: string,
) {
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || !payload.ok) {
    throw buildApiClientError(payload, fallbackMessage);
  }

  return payload.data;
}

export async function createApiClientError(
  response: Response,
  fallbackMessage: string,
) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as ApiSuccess<unknown> | ApiFailure;
      return buildApiClientError(payload, fallbackMessage);
    } catch {
      return new ApiClientError(fallbackMessage);
    }
  }

  return new ApiClientError(fallbackMessage);
}

export function redirectToSessionExpiredLogin() {
  if (typeof window === "undefined") {
    return;
  }

  window.location.replace("/login?reason=session-expired");
}

export function handleUnauthorizedApiClientError(error: unknown) {
  if (!(error instanceof ApiClientError) || error.code !== "UNAUTHORIZED") {
    return false;
  }

  redirectToSessionExpiredLogin();
  return true;
}
