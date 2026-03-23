import { AppError } from "@/lib/errors";
import { sanitizeText } from "@/lib/utils";

export function requireString(value: unknown, fieldName: string, maxLength?: number) {
  const normalized = sanitizeText(typeof value === "string" ? value : "");
  if (!normalized) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `${fieldName} is required.`,
    );
  }

  if (maxLength && normalized.length > maxLength) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `${fieldName} must be ${maxLength} characters or fewer.`,
    );
  }

  return normalized;
}

export function optionalString(value: unknown, maxLength?: number) {
  const normalized = sanitizeText(typeof value === "string" ? value : "");
  if (!normalized) {
    return null;
  }

  if (maxLength && normalized.length > maxLength) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `Value must be ${maxLength} characters or fewer.`,
    );
  }

  return normalized;
}

export function requireNumber(value: unknown, fieldName: string) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("VALIDATION_ERROR", 400, `${fieldName} must be a number.`);
  }

  return parsed;
}

export function requireInteger(value: unknown, fieldName: string) {
  const parsed = requireNumber(value, fieldName);
  if (!Number.isInteger(parsed)) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      `${fieldName} must be a whole number.`,
    );
  }

  return parsed;
}

export function requireArray<T = unknown>(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new AppError("VALIDATION_ERROR", 400, `${fieldName} must be an array.`);
  }

  return value as T[];
}
