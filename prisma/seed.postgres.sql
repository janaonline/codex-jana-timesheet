-- Standalone Postgres seed equivalent for prisma/seed.ts.
-- Run this after Prisma migrations have been deployed:
--   psql "$DATABASE_URL" -f prisma/seed.postgres.sql

BEGIN;

SET LOCAL search_path = public, pg_temp;
SET LOCAL TIME ZONE 'UTC';

CREATE OR REPLACE FUNCTION pg_temp.seed_ist_midnight(p_date date)
RETURNS timestamp
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_date::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_ist_timestamp(p_value text)
RETURNS timestamp
LANGUAGE sql
STABLE
AS $$
  SELECT p_value::timestamptz AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_month_start(p_month_key text)
RETURNS timestamp
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT pg_temp.seed_ist_midnight(to_date(p_month_key || '-01', 'YYYY-MM-DD'));
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_ist_date_from_utc_timestamp(
  p_value timestamp
)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((p_value AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_working_dates(
  p_month_key text,
  p_join_date timestamp,
  p_exit_date timestamp
)
RETURNS TABLE(work_date date)
LANGUAGE sql
STABLE
AS $$
  SELECT day_value::date AS work_date
  FROM generate_series(
    to_date(p_month_key || '-01', 'YYYY-MM-DD'),
    (to_date(p_month_key || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::date,
    INTERVAL '1 day'
  ) AS day_series(day_value)
  WHERE EXTRACT(DOW FROM day_value)::int NOT IN (0, 6)
    AND (
      p_join_date IS NULL
      OR day_value::date >= pg_temp.seed_ist_date_from_utc_timestamp(p_join_date)
    )
    AND (
      p_exit_date IS NULL
      OR day_value::date <= pg_temp.seed_ist_date_from_utc_timestamp(p_exit_date)
    )
  ORDER BY day_value::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_legacy_day_states(
  p_month_key text,
  p_leave_days double precision,
  p_join_date timestamp,
  p_exit_date timestamp
)
RETURNS TABLE(work_date date, leave_type "LeaveType")
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      GREATEST(FLOOR(p_leave_days)::int, 0) AS full_days,
      p_leave_days - FLOOR(p_leave_days) >= 0.5 AS has_half_day
  ),
  available_dates AS (
    SELECT
      working.work_date,
      ROW_NUMBER() OVER (ORDER BY working.work_date)::int AS ordinal
    FROM pg_temp.seed_working_dates(p_month_key, p_join_date, p_exit_date) AS working
  )
  SELECT
    available_dates.work_date,
    CASE
      WHEN available_dates.ordinal <= params.full_days THEN 'FULL_DAY'::"LeaveType"
      ELSE 'HALF_DAY'::"LeaveType"
    END AS leave_type
  FROM available_dates
  CROSS JOIN params
  WHERE available_dates.ordinal <= params.full_days
     OR (params.has_half_day AND available_dates.ordinal = params.full_days + 1)
  ORDER BY available_dates.work_date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_capacity_summary(
  p_month_key text,
  p_leave_days double precision,
  p_join_date timestamp,
  p_exit_date timestamp
)
RETURNS TABLE(
  working_days_count int,
  leave_days double precision,
  assigned_minutes int,
  assigned_hours double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH working AS (
    SELECT COUNT(*)::int AS working_days_count
    FROM pg_temp.seed_working_dates(p_month_key, p_join_date, p_exit_date)
  ),
  leaves AS (
    SELECT
      COUNT(*) FILTER (WHERE leave_type = 'FULL_DAY'::"LeaveType")::int AS full_days,
      COUNT(*) FILTER (WHERE leave_type = 'HALF_DAY'::"LeaveType")::int AS half_days
    FROM pg_temp.seed_legacy_day_states(
      p_month_key,
      p_leave_days,
      p_join_date,
      p_exit_date
    )
  ),
  calculated AS (
    SELECT
      working.working_days_count,
      (leaves.full_days + (leaves.half_days * 0.5))::double precision AS leave_days,
      (
        (working.working_days_count * 480)
        - (leaves.full_days * 480)
        - (leaves.half_days * 240)
      )::int AS assigned_minutes
    FROM working
    CROSS JOIN leaves
  )
  SELECT
    calculated.working_days_count,
    calculated.leave_days,
    calculated.assigned_minutes,
    ROUND((calculated.assigned_minutes / 60.0)::numeric, 2)::double precision AS assigned_hours
  FROM calculated;
$$;

DO $seed$
DECLARE
  v_now timestamp := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
  v_seeded_password_hash text :=
    'scrypt:736565646564706f7374677265733236:e46c56b1dfc95268c6c3dd6ff7321f1016462d9b8b31e1a9929eb08cc64b2966c13f2e08b9f6af74e50d0bbac7ddbaeac07e1d6c516bdf50c8e25c2bcec02184';
  v_password_set_at timestamp := pg_temp.seed_ist_timestamp('2026-03-01 09:00:00+05:30');
  v_current_month_key text := TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM');
  v_previous_month_key text :=
    TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 month', 'YYYY-MM');
  v_older_month_key text := '2026-01';

  v_girija_id text;
  v_anita_id text;
  v_ravi_id text;

  v_plan record;
  v_timesheet_id text;
  v_ravi_previous_timesheet_id text;
  v_user_id text;
  v_join_date timestamp;
  v_exit_date timestamp;
  v_working_days_count int;
  v_leave_days double precision;
  v_assigned_minutes int;
  v_assigned_hours double precision;
  v_total_minutes int;
  v_submitted_at timestamp;
  v_frozen_at timestamp;
BEGIN
  INSERT INTO "Project" (
    "id",
    "code",
    "name",
    "description",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES
    (
      'seed-project-liv',
      'LIV',
      'Livable Cities',
      'Urban governance and infrastructure workstream.',
      true,
      v_now,
      v_now
    ),
    (
      'seed-project-dem',
      'DEM',
      'Democratic Accountability',
      'Citizen participation and civic process programs.',
      true,
      v_now,
      v_now
    ),
    (
      'seed-project-rur',
      'RUR',
      'Rural Systems',
      'Rural governance pilots and supporting program work.',
      true,
      v_now,
      v_now
    )
  ON CONFLICT ("code") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "User" (
    "id",
    "email",
    "name",
    "role",
    "passwordHash",
    "passwordSetAt",
    "passwordResetRequired",
    "emailVerifiedAt",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'seed-user-girija-admin',
    'girija.admin@janaagraha.org',
    'Girija Admin',
    'ADMIN'::"UserRole",
    v_seeded_password_hash,
    v_password_set_at,
    false,
    v_password_set_at,
    true,
    v_now,
    v_now
  )
  ON CONFLICT ("email") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "passwordHash" = EXCLUDED."passwordHash",
    "passwordSetAt" = EXCLUDED."passwordSetAt",
    "passwordResetRequired" = EXCLUDED."passwordResetRequired",
    "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
    "updatedAt" = EXCLUDED."updatedAt";

  SELECT "id" INTO v_girija_id FROM "User" WHERE "email" = 'girija.admin@janaagraha.org';

  INSERT INTO "User" (
    "id",
    "email",
    "name",
    "role",
    "passwordHash",
    "passwordSetAt",
    "passwordResetRequired",
    "emailVerifiedAt",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES
    (
      'seed-user-kishora-admin',
      'kishora.admin@janaagraha.org',
      'Kishora Admin',
      'ADMIN'::"UserRole",
      v_seeded_password_hash,
      v_password_set_at,
      false,
      v_password_set_at,
      true,
      v_now,
      v_now
    ),
    (
      'seed-user-mira-operations',
      'mira.operations@janaagraha.org',
      'Mira Operations',
      'OPERATIONS'::"UserRole",
      v_seeded_password_hash,
      v_password_set_at,
      false,
      v_password_set_at,
      true,
      v_now,
      v_now
    )
  ON CONFLICT ("email") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "passwordHash" = EXCLUDED."passwordHash",
    "passwordSetAt" = EXCLUDED."passwordSetAt",
    "passwordResetRequired" = EXCLUDED."passwordResetRequired",
    "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "User" (
    "id",
    "email",
    "name",
    "role",
    "approverUserId",
    "joinDate",
    "passwordHash",
    "passwordSetAt",
    "passwordResetRequired",
    "emailVerifiedAt",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'seed-user-anita-director',
    'anita.director@janaagraha.org',
    'Anita Director',
    'PROGRAM_HEAD'::"UserRole",
    v_girija_id,
    pg_temp.seed_ist_timestamp('2025-01-01 00:00:00+05:30'),
    v_seeded_password_hash,
    v_password_set_at,
    false,
    v_password_set_at,
    true,
    v_now,
    v_now
  )
  ON CONFLICT ("email") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "approverUserId" = EXCLUDED."approverUserId",
    "joinDate" = EXCLUDED."joinDate",
    "passwordHash" = EXCLUDED."passwordHash",
    "passwordSetAt" = EXCLUDED."passwordSetAt",
    "passwordResetRequired" = EXCLUDED."passwordResetRequired",
    "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "User" (
    "id",
    "email",
    "name",
    "role",
    "approverUserId",
    "joinDate",
    "passwordHash",
    "passwordSetAt",
    "passwordResetRequired",
    "emailVerifiedAt",
    "isActive",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'seed-user-ravi-director',
    'ravi.director@janaagraha.org',
    'Ravi Director',
    'PROGRAM_HEAD'::"UserRole",
    v_girija_id,
    pg_temp.seed_ist_timestamp('2025-07-01 00:00:00+05:30'),
    NULL,
    NULL,
    false,
    NULL,
    true,
    v_now,
    v_now
  )
  ON CONFLICT ("email") DO UPDATE
  SET
    "name" = EXCLUDED."name",
    "role" = EXCLUDED."role",
    "approverUserId" = EXCLUDED."approverUserId",
    "joinDate" = EXCLUDED."joinDate",
    "passwordHash" = EXCLUDED."passwordHash",
    "passwordSetAt" = EXCLUDED."passwordSetAt",
    "passwordResetRequired" = EXCLUDED."passwordResetRequired",
    "emailVerifiedAt" = EXCLUDED."emailVerifiedAt",
    "updatedAt" = EXCLUDED."updatedAt";

  SELECT "id" INTO v_anita_id FROM "User" WHERE "email" = 'anita.director@janaagraha.org';
  SELECT "id" INTO v_ravi_id FROM "User" WHERE "email" = 'ravi.director@janaagraha.org';

  DELETE FROM "AuthOtpChallenge";

  INSERT INTO "SystemConfiguration" (
    "id",
    "reminderDays",
    "autoSubmitDay",
    "completionThreshold",
    "inactivityTimeoutMins",
    "supportContactEmail",
    "holidayCalendar",
    "roleAccess",
    "emailTemplates",
    "notifyAdminOnAutoSubmit",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'default',
    '{
      "currentMonthDraftDays": [25, 28],
      "currentMonthSubmitDay": "last-day",
      "nextMonthPendingDays": [3]
    }'::jsonb,
    5,
    100,
    30,
    'support@janaagraha.org',
    '[]'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb,
    true,
    v_now,
    v_now
  )
  ON CONFLICT ("id") DO UPDATE
  SET
    "reminderDays" = EXCLUDED."reminderDays",
    "autoSubmitDay" = EXCLUDED."autoSubmitDay",
    "completionThreshold" = EXCLUDED."completionThreshold",
    "inactivityTimeoutMins" = EXCLUDED."inactivityTimeoutMins",
    "supportContactEmail" = EXCLUDED."supportContactEmail",
    "holidayCalendar" = EXCLUDED."holidayCalendar",
    "roleAccess" = EXCLUDED."roleAccess",
    "emailTemplates" = EXCLUDED."emailTemplates",
    "notifyAdminOnAutoSubmit" = EXCLUDED."notifyAdminOnAutoSubmit",
    "updatedAt" = EXCLUDED."updatedAt";

  FOR v_plan IN
    SELECT *
    FROM (
      VALUES
        (
          'seed-timesheet-anita-current',
          'anita.director@janaagraha.org',
          v_current_month_key,
          1::double precision,
          'DRAFT'::"TimesheetStatus",
          3840::int,
          ARRAY['DEM', 'LIV']::text[],
          NULL::text
        ),
        (
          'seed-timesheet-anita-previous',
          'anita.director@janaagraha.org',
          v_previous_month_key,
          0::double precision,
          'SUBMITTED'::"TimesheetStatus",
          NULL::int,
          ARRAY['DEM', 'LIV']::text[],
          NULL::text
        ),
        (
          'seed-timesheet-ravi-previous',
          'ravi.director@janaagraha.org',
          v_previous_month_key,
          0::double precision,
          'EDIT_REQUESTED'::"TimesheetStatus",
          4800::int,
          ARRAY['LIV', 'RUR']::text[],
          NULL::text
        ),
        (
          'seed-timesheet-anita-older',
          'anita.director@janaagraha.org',
          v_older_month_key,
          0::double precision,
          'AUTO_SUBMITTED'::"TimesheetStatus",
          NULL::int,
          ARRAY['DEM', 'RUR']::text[],
          NULL::text
        )
    ) AS plan(
      seed_id,
      user_email,
      month_key,
      leave_days,
      status,
      requested_total_minutes,
      project_codes,
      rejection_reason
    )
  LOOP
    SELECT "id", "joinDate", "exitDate"
    INTO v_user_id, v_join_date, v_exit_date
    FROM "User"
    WHERE "email" = v_plan.user_email;

    SELECT
      capacity.working_days_count,
      capacity.leave_days,
      capacity.assigned_minutes,
      capacity.assigned_hours
    INTO
      v_working_days_count,
      v_leave_days,
      v_assigned_minutes,
      v_assigned_hours
    FROM pg_temp.seed_capacity_summary(
      v_plan.month_key,
      v_plan.leave_days,
      v_join_date,
      v_exit_date
    ) AS capacity;

    v_total_minutes := COALESCE(v_plan.requested_total_minutes, v_assigned_minutes);

    v_submitted_at :=
      CASE
        WHEN v_plan.status IN (
          'SUBMITTED'::"TimesheetStatus",
          'AUTO_SUBMITTED'::"TimesheetStatus",
          'RESUBMITTED'::"TimesheetStatus"
        )
          THEN pg_temp.seed_ist_timestamp(v_plan.month_key || '-28 18:00:00+05:30')
        ELSE NULL
      END;

    v_frozen_at :=
      CASE
        WHEN v_plan.status IN (
          'FROZEN'::"TimesheetStatus",
          'AUTO_SUBMITTED'::"TimesheetStatus",
          'SUBMITTED'::"TimesheetStatus",
          'RESUBMITTED'::"TimesheetStatus"
        )
          THEN pg_temp.seed_ist_timestamp(v_plan.month_key || '-28 18:00:00+05:30')
        ELSE NULL
      END;

    INSERT INTO "Timesheet" (
      "id",
      "userId",
      "monthKey",
      "monthStart",
      "leaveDays",
      "workingDaysCount",
      "assignedMinutes",
      "assignedHours",
      "status",
      "submittedAt",
      "frozenAt",
      "rejectionReason",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_plan.seed_id,
      v_user_id,
      v_plan.month_key,
      pg_temp.seed_month_start(v_plan.month_key),
      v_leave_days,
      v_working_days_count,
      v_assigned_minutes,
      v_assigned_hours,
      v_plan.status,
      v_submitted_at,
      v_frozen_at,
      v_plan.rejection_reason,
      v_now,
      v_now
    )
    ON CONFLICT ("userId", "monthKey") DO UPDATE
    SET
      "monthStart" = EXCLUDED."monthStart",
      "leaveDays" = EXCLUDED."leaveDays",
      "workingDaysCount" = EXCLUDED."workingDaysCount",
      "assignedMinutes" = EXCLUDED."assignedMinutes",
      "assignedHours" = EXCLUDED."assignedHours",
      "status" = EXCLUDED."status",
      "submittedAt" = EXCLUDED."submittedAt",
      "frozenAt" = EXCLUDED."frozenAt",
      "rejectionReason" = EXCLUDED."rejectionReason",
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "id" INTO v_timesheet_id;

    DELETE FROM "TimesheetEntry" WHERE "timesheetId" = v_timesheet_id;
    DELETE FROM "TimesheetDayState" WHERE "timesheetId" = v_timesheet_id;

    IF v_total_minutes > 0 THEN
      WITH entry_days AS (
        SELECT
          day_number::int AS entry_number,
          LEAST(480, v_total_minutes - ((day_number::int - 1) * 480))::int AS minutes
        FROM generate_series(1, CEIL(v_total_minutes / 480.0)::int) AS day_values(day_number)
      )
      INSERT INTO "TimesheetEntry" (
        "id",
        "timesheetId",
        "projectId",
        "workDate",
        "minutes",
        "hours",
        "description",
        "createdVia",
        "lastEditedVia",
        "createdAt",
        "updatedAt"
      )
      SELECT
        FORMAT('%s-entry-%s', v_timesheet_id, LPAD(entry_days.entry_number::text, 2, '0')),
        v_timesheet_id,
        project."id",
        pg_temp.seed_ist_midnight(
          to_date(
            v_plan.month_key || '-' || LPAD(entry_days.entry_number::text, 2, '0'),
            'YYYY-MM-DD'
          )
        ),
        entry_days.minutes,
        ROUND((entry_days.minutes / 60.0)::numeric, 2)::double precision,
        FORMAT('Program delivery and leadership support for %s', v_plan.month_key),
        'DAY'::"EntryOrigin",
        'DAY'::"EntryOrigin",
        v_now,
        v_now
      FROM entry_days
      JOIN "Project" AS project
        ON project."code" =
          v_plan.project_codes[
            ((entry_days.entry_number - 1) % ARRAY_LENGTH(v_plan.project_codes, 1)) + 1
          ]
      ORDER BY entry_days.entry_number;
    END IF;

    INSERT INTO "TimesheetDayState" (
      "id",
      "timesheetId",
      "workDate",
      "leaveType",
      "isPersonalNonWorkingDay",
      "createdAt",
      "updatedAt"
    )
    SELECT
      FORMAT('%s-daystate-%s', v_timesheet_id, TO_CHAR(day_state.work_date, 'YYYYMMDD')),
      v_timesheet_id,
      pg_temp.seed_ist_midnight(day_state.work_date),
      day_state.leave_type,
      false,
      v_now,
      v_now
    FROM pg_temp.seed_legacy_day_states(
      v_plan.month_key,
      v_plan.leave_days,
      v_join_date,
      v_exit_date
    ) AS day_state;

    IF v_plan.user_email = 'ravi.director@janaagraha.org'
       AND v_plan.month_key = v_previous_month_key THEN
      v_ravi_previous_timesheet_id := v_timesheet_id;
    END IF;
  END LOOP;

  INSERT INTO "EditRequest" (
    "id",
    "timesheetId",
    "requestedById",
    "status",
    "reason",
    "requestedAt"
  )
  VALUES (
    'seed-pending-edit-request',
    v_ravi_previous_timesheet_id,
    v_ravi_id,
    'PENDING'::"EditRequestStatus",
    'Need to correct late-entered hours before payroll reconciliation.',
    v_now
  )
  ON CONFLICT ("id") DO UPDATE
  SET
    "timesheetId" = EXCLUDED."timesheetId",
    "requestedById" = EXCLUDED."requestedById",
    "status" = EXCLUDED."status",
    "reason" = EXCLUDED."reason";

  INSERT INTO "EmailLog" (
    "id",
    "userId",
    "category",
    "subject",
    "recipient",
    "status",
    "attempts",
    "htmlPreview",
    "sentAt",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'seed-email-log-previous-month-submitted',
    v_anita_id,
    'SUBMISSION_CONFIRMATION',
    '[Seed] Previous month timesheet submitted',
    'anita.director@janaagraha.org',
    'SENT'::"EmailLogStatus",
    1,
    '<p>Seeded email log</p>',
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT ("id") DO UPDATE
  SET
    "userId" = EXCLUDED."userId",
    "category" = EXCLUDED."category",
    "subject" = EXCLUDED."subject",
    "recipient" = EXCLUDED."recipient",
    "status" = EXCLUDED."status",
    "attempts" = EXCLUDED."attempts",
    "htmlPreview" = EXCLUDED."htmlPreview",
    "sentAt" = EXCLUDED."sentAt",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "AuditLog" (
    "id",
    "actorUserId",
    "subjectUserId",
    "action",
    "entityType",
    "entityId",
    "createdAt"
  )
  VALUES
    (
      'seed-audit-timesheet-submitted',
      v_anita_id,
      v_anita_id,
      'TIMESHEET_SUBMITTED',
      'TIMESHEET',
      v_anita_id,
      v_now
    ),
    (
      'seed-audit-edit-request-created',
      v_girija_id,
      v_ravi_id,
      'EDIT_REQUEST_CREATED',
      'EDIT_REQUEST',
      'seed-pending-edit-request',
      v_now
    )
  ON CONFLICT ("id") DO UPDATE
  SET
    "actorUserId" = EXCLUDED."actorUserId",
    "subjectUserId" = EXCLUDED."subjectUserId",
    "action" = EXCLUDED."action",
    "entityType" = EXCLUDED."entityType",
    "entityId" = EXCLUDED."entityId";

  RAISE NOTICE 'Seeded password for Anita, Girija, Kishora, and Mira: Jana@Timesheet2026';
  RAISE NOTICE 'Ravi Director is left without a password for first-time activation testing.';
END
$seed$;

COMMIT;
