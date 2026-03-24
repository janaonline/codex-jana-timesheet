import {
  evaluateOtpAttempt,
  generateOtpCode,
  hashOtpCode,
  hashPassword,
  requiresPasswordSetup,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/password-auth";

describe("password and OTP helpers", () => {
  it("hashes passwords securely and verifies them", async () => {
    const password = "StrongPass!2026";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("validates strong password requirements", () => {
    expect(validatePasswordStrength("weak")).toEqual(
      expect.arrayContaining([
        "Password must be at least 12 characters long.",
        "Password must include at least one uppercase letter.",
        "Password must include at least one number.",
        "Password must include at least one special character.",
      ]),
    );
    expect(validatePasswordStrength("StrongPass!2026")).toHaveLength(0);
  });

  it("issues numeric six-digit OTP values", () => {
    const code = generateOtpCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  it("rejects expired OTP challenges", () => {
    const secret = "test-secret";
    const challengeId = "expired";

    expect(
      evaluateOtpAttempt(
        {
          id: challengeId,
          codeHash: hashOtpCode(challengeId, "123456", secret),
          attempts: 0,
          expiresAt: new Date("2026-03-24T09:59:59.000Z"),
        },
        "123456",
        new Date("2026-03-24T10:00:00.000Z"),
        secret,
      ),
    ).toEqual({
      ok: false,
      errorCode: "OTP_EXPIRED",
      nextAttempts: 0,
    });
  });

  it("marks OTPs as single-use once consumed", () => {
    const secret = "test-secret";
    const challengeId = "consumed";

    expect(
      evaluateOtpAttempt(
        {
          id: challengeId,
          codeHash: hashOtpCode(challengeId, "123456", secret),
          attempts: 1,
          expiresAt: new Date("2026-03-24T10:10:00.000Z"),
          consumedAt: new Date("2026-03-24T10:00:00.000Z"),
        },
        "123456",
        new Date("2026-03-24T10:05:00.000Z"),
        secret,
      ),
    ).toEqual({
      ok: false,
      errorCode: "OTP_ALREADY_USED",
      nextAttempts: 1,
    });
  });

  it("enforces the OTP attempt limit", () => {
    const secret = "test-secret";
    const challengeId = "attempts";

    expect(
      evaluateOtpAttempt(
        {
          id: challengeId,
          codeHash: hashOtpCode(challengeId, "123456", secret),
          attempts: 4,
          expiresAt: new Date("2026-03-24T10:10:00.000Z"),
        },
        "000000",
        new Date("2026-03-24T10:05:00.000Z"),
        secret,
      ),
    ).toEqual({
      ok: false,
      errorCode: "OTP_ATTEMPTS_EXCEEDED",
      nextAttempts: 5,
    });
  });

  it("tracks when a user still needs to set a password", () => {
    expect(
      requiresPasswordSetup({
        passwordHash: null,
        passwordResetRequired: false,
      }),
    ).toBe(true);
    expect(
      requiresPasswordSetup({
        passwordHash: "hash",
        passwordResetRequired: true,
      }),
    ).toBe(true);
    expect(
      requiresPasswordSetup({
        passwordHash: "hash",
        passwordResetRequired: false,
      }),
    ).toBe(false);
  });
});
