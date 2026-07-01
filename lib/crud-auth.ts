import { timingSafeEqual } from "node:crypto";

import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export function requireCrudApiKey(request: Request): void {
  const apiKey = env.crudApiKey;
  if (!apiKey) {
    throw new AppError("UNAUTHORIZED", 401, "API key not configured.");
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // console.log({token, apiKey, header});
  if (!token) {
    throw new AppError(
      "UNAUTHORIZED",
      401,
      "Authorization header with Bearer token required.",
    );
  }
  const a = Buffer.from(token);
  const b = Buffer.from(apiKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("UNAUTHORIZED", 401, "Invalid API key.");
  }
}
