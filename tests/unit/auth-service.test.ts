const {
  prismaMock,
  rateLimitMock,
  sendOtpMessageMock,
  safeWriteAuditLogMock,
} = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    authOtpChallenge: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  rateLimitMock: vi.fn(),
  sendOtpMessageMock: vi.fn(),
  safeWriteAuditLogMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: rateLimitMock,
}));

vi.mock("@/services/email-service", () => ({
  sendOtpMessage: sendOtpMessageMock,
}));

vi.mock("@/services/audit-service", () => ({
  safeWriteAuditLog: safeWriteAuditLogMock,
}));

import { hashOtpCode, verifyPassword } from "@/lib/password-auth";
import {
  authorizeOtpUser,
  requestOtpChallenge,
  setPasswordForUser,
} from "@/services/auth-service";

describe("auth service", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.update.mockReset();
    prismaMock.authOtpChallenge.findFirst.mockReset();
    prismaMock.authOtpChallenge.updateMany.mockReset();
    prismaMock.authOtpChallenge.create.mockReset();
    prismaMock.authOtpChallenge.update.mockReset();
    prismaMock.$transaction.mockReset();
    rateLimitMock.mockReset();
    sendOtpMessageMock.mockReset();
    safeWriteAuditLogMock.mockReset();
  });

  it("returns a generic OTP response for unknown users", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      requestOtpChallenge({
        email: "unknown@janaagraha.org",
        purpose: "FIRST_LOGIN",
        requesterKey: "127.0.0.1",
      }),
    ).resolves.toMatchObject({
      sent: false,
      expiresInMinutes: 10,
    });

    expect(sendOtpMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.authOtpChallenge.create).not.toHaveBeenCalled();
  });

  it("issues and stores a hashed OTP challenge for first-time activation", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ravi.director@janaagraha.org",
      name: "Ravi Director",
      role: "PROGRAM_HEAD",
      isActive: true,
      azureGroups: [],
      passwordHash: null,
      passwordResetRequired: false,
      emailVerifiedAt: null,
    });
    prismaMock.authOtpChallenge.findFirst.mockResolvedValue(null);
    prismaMock.authOtpChallenge.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.authOtpChallenge.create.mockResolvedValue({ id: "challenge-1" });

    const response = await requestOtpChallenge({
      email: "ravi.director@janaagraha.org",
      purpose: "FIRST_LOGIN",
      requesterKey: "127.0.0.1",
    });

    expect(response).toMatchObject({
      sent: true,
      cooldownSeconds: 60,
      expiresInMinutes: 10,
    });
    expect(sendOtpMessageMock).toHaveBeenCalledTimes(1);

    const createArgs = prismaMock.authOtpChallenge.create.mock.calls[0][0].data;
    const otpPayload = sendOtpMessageMock.mock.calls[0][0];

    expect(createArgs.email).toBe("ravi.director@janaagraha.org");
    expect(createArgs.codeHash).toBe(hashOtpCode(createArgs.id, otpPayload.otpCode));
    expect(otpPayload.purpose).toBe("FIRST_LOGIN");
    expect(safeWriteAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AUTH_OTP_ISSUED",
        subjectUserId: "user-1",
      }),
    );
  });

  it("honors the resend cooldown for active OTP challenges", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "anita.director@janaagraha.org",
      name: "Anita Director",
      role: "PROGRAM_HEAD",
      isActive: true,
      azureGroups: [],
      passwordHash: "hash",
      passwordResetRequired: false,
      emailVerifiedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    prismaMock.authOtpChallenge.findFirst.mockResolvedValue({
      id: "challenge-1",
      resendAvailableAt: new Date(Date.now() + 45_000),
    });

    const response = await requestOtpChallenge({
      email: "anita.director@janaagraha.org",
      purpose: "FORGOT_PASSWORD",
      requesterKey: "127.0.0.1",
    });

    expect(response.sent).toBe(false);
    expect(response.cooldownSeconds).toBeGreaterThan(0);
    expect(prismaMock.authOtpChallenge.create).not.toHaveBeenCalled();
  });

  it("promotes a verified OTP flow into a password-setup-required session", async () => {
    const code = "482910";
    const challengeId = "challenge-verified";
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "ravi.director@janaagraha.org",
      name: "Ravi Director",
      role: "PROGRAM_HEAD",
      isActive: true,
      azureGroups: [],
      passwordHash: null,
      passwordResetRequired: false,
      emailVerifiedAt: null,
    });
    prismaMock.authOtpChallenge.findFirst.mockResolvedValue({
      id: challengeId,
      email: "ravi.director@janaagraha.org",
      purpose: "FIRST_LOGIN",
      codeHash: hashOtpCode(challengeId, code),
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60_000),
      verifiedAt: null,
      consumedAt: null,
      createdAt: new Date(),
    });

    const txMock = {
      authOtpChallenge: {
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        update: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "ravi.director@janaagraha.org",
          name: "Ravi Director",
          role: "PROGRAM_HEAD",
          isActive: true,
          azureGroups: [],
          passwordHash: null,
          passwordResetRequired: true,
          emailVerifiedAt: new Date(),
        }),
      },
    };
    prismaMock.$transaction.mockImplementation(async (callback) => callback(txMock));

    const user = await authorizeOtpUser({
      email: "ravi.director@janaagraha.org",
      code,
      purpose: "FIRST_LOGIN",
      requesterKey: "127.0.0.1",
    });

    expect(txMock.authOtpChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: challengeId },
      }),
    );
    expect(txMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          passwordResetRequired: true,
        }),
      }),
    );
    expect(user.passwordSetupRequired).toBe(true);
  });

  it("stores a secure hash and clears reset mode when a password is set", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "girija.admin@janaagraha.org",
      name: "Girija Admin",
      role: "ADMIN",
      isActive: true,
      azureGroups: [],
      passwordHash: null,
      passwordResetRequired: true,
      emailVerifiedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    prismaMock.user.update.mockImplementation(async ({ data }) => ({
      id: "user-1",
      email: "girija.admin@janaagraha.org",
      name: "Girija Admin",
      role: "ADMIN",
      isActive: true,
      azureGroups: [],
      passwordHash: data.passwordHash,
      passwordResetRequired: false,
      emailVerifiedAt: data.emailVerifiedAt,
    }));

    const password = "SecureReset!2026";
    const user = await setPasswordForUser({
      userId: "user-1",
      password,
    });

    const updateArgs = prismaMock.user.update.mock.calls[0][0].data;
    expect(updateArgs.passwordHash).toBeDefined();
    expect(updateArgs.passwordHash).not.toBe(password);
    await expect(verifyPassword(password, updateArgs.passwordHash)).resolves.toBe(
      true,
    );
    expect(updateArgs.passwordResetRequired).toBe(false);
    expect(user.passwordSetupRequired).toBe(false);
  });
});
