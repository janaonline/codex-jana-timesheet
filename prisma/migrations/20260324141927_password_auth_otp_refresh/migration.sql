-- CreateEnum
CREATE TYPE "AuthOtpPurpose" AS ENUM ('FIRST_LOGIN', 'FORGOT_PASSWORD', 'ACCOUNT_ACTIVATION');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuthOtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "purpose" "AuthOtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAvailableAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthOtpChallenge_email_purpose_createdAt_idx" ON "AuthOtpChallenge"("email", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AuthOtpChallenge_expiresAt_idx" ON "AuthOtpChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "AuthOtpChallenge" ADD CONSTRAINT "AuthOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
