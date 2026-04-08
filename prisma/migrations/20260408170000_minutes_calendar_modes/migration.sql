-- CreateEnum
CREATE TYPE "EntryOrigin" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('NONE', 'HALF_DAY', 'FULL_DAY');

-- AlterTable
ALTER TABLE "Timesheet"
ALTER COLUMN "leaveDays" TYPE DOUBLE PRECISION USING "leaveDays"::DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Timesheet"
ADD COLUMN     "assignedMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TimesheetEntry"
ADD COLUMN     "createdVia" "EntryOrigin" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "lastEditedVia" "EntryOrigin" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TimesheetEntry"
ALTER COLUMN "hours" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "TimesheetDayState" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "leaveType" "LeaveType" NOT NULL DEFAULT 'NONE',
    "isPersonalNonWorkingDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetDayState_pkey" PRIMARY KEY ("id")
);

-- Backfill entry minutes using the new 10-minute canonical resolution.
WITH normalized_entries AS (
    SELECT
        "id",
        CAST(ROUND("hours" * 60.0 / 10.0) * 10 AS INTEGER) AS "normalizedMinutes"
    FROM "TimesheetEntry"
)
UPDATE "TimesheetEntry" AS entry
SET
    "minutes" = normalized_entries."normalizedMinutes",
    "hours" = normalized_entries."normalizedMinutes" / 60.0
FROM normalized_entries
WHERE normalized_entries."id" = entry."id";

-- Backfill assigned minutes from the legacy assigned-hours cache.
UPDATE "Timesheet"
SET "assignedMinutes" = CAST(ROUND("assignedHours" * 60.0) AS INTEGER);

-- CreateIndex
CREATE INDEX "TimesheetDayState_timesheetId_idx" ON "TimesheetDayState"("timesheetId");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetDayState_timesheetId_workDate_key" ON "TimesheetDayState"("timesheetId", "workDate");

-- AddForeignKey
ALTER TABLE "TimesheetDayState" ADD CONSTRAINT "TimesheetDayState_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
