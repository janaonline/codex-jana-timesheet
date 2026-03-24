import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { scrypt as scryptCallback } from "node:crypto";

import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  PASSWORD_MIN_LENGTH,
} from "@/lib/constants";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const scrypt = promisify(scryptCallback);
const PASSWORD_HASH_PREFIX = "scrypt";

function timingSafeHexMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function validatePasswordStrength(password: string) {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`);
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }

  if (!/\d/.test(password)) {
    errors.push("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include at least one special character.");
  }

  return errors;
}

export function assertStrongPassword(password: string) {
  const errors = validatePasswordStrength(password);

  if (errors.length > 0) {
    throw new AppError(
      "WEAK_PASSWORD",
      400,
      "Please choose a stronger password.",
      errors,
    );
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${PASSWORD_HASH_PREFIX}:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) {
    return false;
  }

  const [prefix, salt, digest] = passwordHash.split(":");
  if (prefix !== PASSWORD_HASH_PREFIX || !salt || !digest) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeHexMatch(derivedKey.toString("hex"), digest);
}

export function generateOtpCode(length = OTP_LENGTH) {
  const maximum = 10 ** length;
  return String(randomInt(0, maximum)).padStart(length, "0");
}

export function hashOtpCode(challengeId: string, code: string, secret = env.nextAuthSecret) {
  return createHmac("sha256", secret)
    .update(`${challengeId}:${code}`)
    .digest("hex");
}

export type OtpChallengeSnapshot = {
  id: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt?: Date | null;
  consumedAt?: Date | null;
};

export type OtpAttemptResult =
  | { ok: true }
  | {
      ok: false;
      errorCode:
        | "OTP_EXPIRED"
        | "OTP_ALREADY_USED"
        | "OTP_INVALID"
        | "OTP_ATTEMPTS_EXCEEDED";
      nextAttempts: number;
    };

export function evaluateOtpAttempt(
  challenge: OtpChallengeSnapshot,
  code: string,
  now = new Date(),
  secret = env.nextAuthSecret,
): OtpAttemptResult {
  if (challenge.verifiedAt || challenge.consumedAt) {
    return {
      ok: false,
      errorCode: "OTP_ALREADY_USED",
      nextAttempts: challenge.attempts,
    };
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return {
      ok: false,
      errorCode: "OTP_ATTEMPTS_EXCEEDED",
      nextAttempts: challenge.attempts,
    };
  }

  if (now > challenge.expiresAt) {
    return {
      ok: false,
      errorCode: "OTP_EXPIRED",
      nextAttempts: challenge.attempts,
    };
  }

  const expectedHash = hashOtpCode(challenge.id, code, secret);

  if (!timingSafeHexMatch(expectedHash, challenge.codeHash)) {
    const nextAttempts = challenge.attempts + 1;
    return {
      ok: false,
      errorCode:
        nextAttempts >= OTP_MAX_ATTEMPTS ? "OTP_ATTEMPTS_EXCEEDED" : "OTP_INVALID",
      nextAttempts,
    };
  }

  return { ok: true };
}

export function requiresPasswordSetup(params: {
  passwordHash?: string | null;
  passwordResetRequired?: boolean;
}) {
  return !params.passwordHash || Boolean(params.passwordResetRequired);
}
