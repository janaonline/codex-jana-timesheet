-- AlterTable
UPDATE "User" SET "designation" = '' WHERE "designation" IS NULL;

ALTER TABLE "User" ALTER COLUMN     "designation" SET NOT NULL;
