import { randomUUID } from "node:crypto";

import type { AuthOtpPurpose, UserRole } from "@prisma/client";

import {
  OTP_EXPIRY_MINUTES,
  OTP_REQUEST_RATE_LIMIT,
  OTP_REQUEST_RATE_LIMIT_WINDOW_MS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_VERIFY_RATE_LIMIT,
  OTP_VERIFY_RATE_LIMIT_WINDOW_MS,
  type OtpPurpose,
} from "@/lib/constants";
import { AppError } from "@/lib/errors";
import {
  assertStrongPassword,
  evaluateOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  requiresPasswordSetup,
  verifyPassword,
} from "@/lib/password-auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { safeWriteAuditLog } from "@/services/audit-service";
import { sendOtpMessage } from "@/services/email-service";

type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  azureGroups: string[];
  passwordSetupRequired: boolean;
};

const userAuthSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  azureGroups: true,
  passwordHash: true,
  passwordResetRequired: true,
  emailVerifiedAt: true,
} as const;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function maskEmailAddress(email: string) {
  const [localPart, domainPart] = email.split("@");

  if (!localPart || !domainPart) {
    return email;
  }

  const visibleStart = localPart.slice(0, 2);
  const visibleEnd = localPart.length > 4 ? localPart.slice(-1) : "";
  return `${visibleStart}${"*".repeat(Math.max(localPart.length - 3, 1))}${visibleEnd}@${domainPart}`;
}

function toAuthenticatedUser(
  user: NonNullable<Awaited<ReturnType<typeof getActiveUserByEmail>>>,
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    azureGroups: Array.isArray(user.azureGroups)
      ? (user.azureGroups as string[])
      : [],
    passwordSetupRequired: requiresPasswordSetup({
      passwordHash: user.passwordHash,
      passwordResetRequired: user.passwordResetRequired,
    }),
  };
}

async function getActiveUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: userAuthSelect,
  }).then((user) => (user?.isActive ? user : null));
}

function isOtpPurposeAllowedForUser(
  user: NonNullable<Awaited<ReturnType<typeof getActiveUserByEmail>>>,
  purpose: AuthOtpPurpose,
) {
  if (purpose === "FORGOT_PASSWORD") {
    return true;
  }

  return (
    !user.emailVerifiedAt ||
    requiresPasswordSetup({
      passwordHash: user.passwordHash,
      passwordResetRequired: user.passwordResetRequired,
    })
  );
}

function getOtpSuccessMessage(email: string) {
  return {
    message:
      "If the email belongs to an active internal account, a one-time code has been sent.",
    destinationHint: maskEmailAddress(email),
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  };
}

export async function authorizePasswordUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await getActiveUserByEmail(normalizedEmail);

  if (!user) {
    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      metadata: {
        provider: "password",
        email: normalizedEmail,
        reason: "Unknown or inactive user.",
      },
    });
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }

  if (!user.passwordHash) {
    throw new AppError(
      "PASSWORD_SETUP_REQUIRED",
      403,
      "Finish account activation to create your password before signing in.",
    );
  }

  if (user.passwordResetRequired) {
    throw new AppError(
      "PASSWORD_SETUP_REQUIRED",
      403,
      "Use the one-time code flow to set a new password before signing in again.",
    );
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      subjectUserId: user.id,
      metadata: {
        provider: "password",
        email: normalizedEmail,
        reason: "Invalid password.",
      },
    });
    throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await safeWriteAuditLog({
    action: "AUTHENTICATION_SUCCEEDED",
    entityType: "AUTH",
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: {
      provider: "password",
    },
  });

  return toAuthenticatedUser(user);
}

export async function requestOtpChallenge(params: {
  email: string;
  purpose: OtpPurpose;
  requesterKey: string;
}) {
  const normalizedEmail = normalizeEmail(params.email);

  enforceRateLimit(
    `otp-request:email:${normalizedEmail}`,
    OTP_REQUEST_RATE_LIMIT,
    OTP_REQUEST_RATE_LIMIT_WINDOW_MS,
  );
  enforceRateLimit(
    `otp-request:client:${params.requesterKey}`,
    OTP_REQUEST_RATE_LIMIT,
    OTP_REQUEST_RATE_LIMIT_WINDOW_MS,
  );

  const user = await getActiveUserByEmail(normalizedEmail);
  const response = getOtpSuccessMessage(normalizedEmail);

  if (!user || !isOtpPurposeAllowedForUser(user, params.purpose)) {
    return {
      ...response,
      sent: false,
      cooldownSeconds: 0,
    };
  }

  const existingChallenge = await prisma.authOtpChallenge.findFirst({
    where: {
      email: normalizedEmail,
      purpose: params.purpose,
      consumedAt: null,
      verifiedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingChallenge && existingChallenge.resendAvailableAt > new Date()) {
    return {
      ...response,
      sent: false,
      cooldownSeconds: Math.max(
        1,
        Math.ceil(
          (existingChallenge.resendAvailableAt.getTime() - Date.now()) / 1000,
        ),
      ),
    };
  }

  await prisma.authOtpChallenge.updateMany({
    where: {
      email: normalizedEmail,
      purpose: params.purpose,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const code = generateOtpCode();
  const id = randomUUID();
  const now = new Date();

  await prisma.authOtpChallenge.create({
    data: {
      id,
      userId: user.id,
      email: normalizedEmail,
      purpose: params.purpose,
      codeHash: hashOtpCode(id, code),
      expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000),
      resendAvailableAt: new Date(
        now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      ),
    },
  });

  await sendOtpMessage({
    purpose: params.purpose,
    recipient: user.email,
    userName: user.name,
    userId: user.id,
    otpCode: code,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  await safeWriteAuditLog({
    action: "AUTH_OTP_ISSUED",
    entityType: "AUTH",
    subjectUserId: user.id,
    metadata: {
      purpose: params.purpose,
      email: normalizedEmail,
    },
  });

  return {
    ...response,
    sent: true,
    cooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function authorizeOtpUser(params: {
  email: string;
  code: string;
  purpose: OtpPurpose;
  requesterKey: string;
}) {
  const normalizedEmail = normalizeEmail(params.email);

  enforceRateLimit(
    `otp-verify:email:${normalizedEmail}`,
    OTP_VERIFY_RATE_LIMIT,
    OTP_VERIFY_RATE_LIMIT_WINDOW_MS,
  );
  enforceRateLimit(
    `otp-verify:client:${params.requesterKey}`,
    OTP_VERIFY_RATE_LIMIT,
    OTP_VERIFY_RATE_LIMIT_WINDOW_MS,
  );

  const [user, challenge] = await Promise.all([
    getActiveUserByEmail(normalizedEmail),
    prisma.authOtpChallenge.findFirst({
      where: {
        email: normalizedEmail,
        purpose: params.purpose,
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  ]);

  if (!user || !challenge) {
    throw new AppError("OTP_INVALID", 401, "The code is invalid or has expired.");
  }

  const verification = evaluateOtpAttempt(challenge, params.code, new Date());

  if (!verification.ok) {
    await prisma.authOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: verification.nextAttempts,
        consumedAt:
          verification.errorCode === "OTP_ATTEMPTS_EXCEEDED" ||
          verification.errorCode === "OTP_EXPIRED"
            ? new Date()
            : challenge.consumedAt,
      },
    });

    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      subjectUserId: user.id,
      metadata: {
        provider: "otp",
        purpose: params.purpose,
        email: normalizedEmail,
        reason: verification.errorCode,
      },
    });

    throw new AppError(
      verification.errorCode,
      verification.errorCode === "OTP_ALREADY_USED" ? 409 : 401,
      verification.errorCode === "OTP_EXPIRED"
        ? "This code has expired. Request a new one to continue."
        : verification.errorCode === "OTP_ALREADY_USED"
          ? "This code has already been used. Request a new one to continue."
          : verification.errorCode === "OTP_ATTEMPTS_EXCEEDED"
            ? "Too many incorrect attempts. Request a new code to continue."
            : "The code you entered is incorrect.",
    );
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    await tx.authOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        verifiedAt: new Date(),
        consumedAt: new Date(),
      },
    });

    const nextUser = await tx.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        passwordResetRequired: true,
        lastLoginAt: new Date(),
      },
      select: userAuthSelect,
    });

    await safeWriteAuditLog(
      {
        action: "AUTHENTICATION_SUCCEEDED",
        entityType: "AUTH",
        actorUserId: user.id,
        subjectUserId: user.id,
        metadata: {
          provider: "otp",
          purpose: params.purpose,
        },
      },
      tx as unknown as typeof prisma,
    );

    return nextUser;
  });

  return toAuthenticatedUser(updatedUser);
}

export async function setPasswordForUser(params: {
  userId: string;
  password: string;
}) {
  assertStrongPassword(params.password);

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: userAuthSelect,
  });

  if (!user || !user.isActive) {
    throw new AppError("UNAUTHORIZED", 401, "Authentication is required.");
  }

  const passwordHash = await hashPassword(params.password);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordSetAt: new Date(),
      passwordResetRequired: false,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      lastLoginAt: new Date(),
    },
    select: userAuthSelect,
  });

  await safeWriteAuditLog({
    action: "PASSWORD_UPDATED",
    entityType: "AUTH",
    actorUserId: updatedUser.id,
    subjectUserId: updatedUser.id,
  });

  return toAuthenticatedUser(updatedUser);
}
