```md
# Current Implementation Snapshot

Generated from the checked-in codebase in `codex-jana-timesheet` on 2026-04-08.
This snapshot describes the actual implementation in code, not just the intended requirements.

## High-level overview

- Monolithic Next.js App Router application.
- Backend is implemented through Next.js route handlers under `app/api`.
- Persistence is PostgreSQL via Prisma.
- Authentication is NextAuth/Auth.js with two runtime modes:
  - `password` mode (default): email/password + OTP activation/reset flow.
  - `azuread` mode: Microsoft Entra ID / Azure AD provider if configured.
- Main domain: monthly timesheets for `PROGRAM_HEAD` users, with admin/operations oversight, reminder automation, edit request workflow, reports, exports, audit logs, and email logs.

## Stack and runtime

- Framework: Next.js `15.5.14`
- React: `19.2.4`
- TypeScript
- Styling: Tailwind CSS v4 + a small plain reusable component set
- ORM: Prisma `6.19.2`
- DB: PostgreSQL
- Auth: `next-auth` v4
- Scheduler: `node-cron`
- Email: `nodemailer`
- Export generation: `pdfkit` + CSV string generation
- Tests: Vitest

## Current source layout

- `app/`
  - App Router pages and API routes
- `components/`
  - Auth, admin, timesheet, dashboard, and shared UI components
- `lib/`
  - Auth config, RBAC, validation, calculations, time utilities, env parsing, errors, API helpers
- `services/`
  - Business logic layer
- `prisma/`
  - Schema, migrations, seed
- `emails/`
  - Email template definitions and rendering helpers
- `hooks/`
  - `use-autosave`
- `tests/unit/`
  - Rule/helper/service unit tests

The repo currently has about 102 tracked source files across `app/components/lib/services/prisma/tests`.

## Environment and configuration

`lib/env.ts` exposes parsed environment values with defaults:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_MODE` -> `"password"` or `"azuread"`; defaults to `"password"`
- Azure AD envs:
  - `AZURE_AD_CLIENT_ID`
  - `AZURE_AD_CLIENT_SECRET`
  - `AZURE_AD_TENANT_ID`
  - `AZURE_AD_PROGRAM_HEAD_GROUP_ID`
  - `AZURE_AD_ADMIN_GROUP_ID`
  - `AZURE_AD_OPERATIONS_GROUP_ID`
- SMTP envs:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`
  - `SMTP_FROM_NAME`
- `APP_BASE_URL`
- `CRON_JOB_SHARED_SECRET`
- `ENABLE_SCHEDULER`
- `SUPPORT_CONTACT_EMAIL`
- `HOLIDAY_CALENDAR_JSON`
- `OBSERVABILITY_WEBHOOK_URL`

Runtime helpers:

- `isPasswordAuthEnabled()`
- `isAzureSsoEnabled()`
- `hasAzureSsoConfig()`
- `hasSmtpConfig()`

Persistent system configuration is stored in `SystemConfiguration` and loaded via `services/configuration-service.ts`.

That DB-backed config currently manages:

- reminder days
- auto submit day (stored, but UI treats it as fixed)
- completion threshold (stored, but UI treats it as fixed at 100)
- inactivity timeout minutes
- holiday calendar
- role access overrides
- email templates
- admin auto-submit notifications flag
- support contact email

## Current auth implementation

Auth is configured in `lib/auth.ts`.

### Modes

1. Password mode
   - Uses two NextAuth `CredentialsProvider`s:
     - `password-login`
     - `email-otp`
   - This is the default mode unless `AUTH_MODE=azuread`.

2. Azure AD mode
   - Uses `next-auth/providers/azure-ad`
   - On sign-in, `syncUserProfile()` upserts the `User` row and resolves role from configured Azure group IDs.

### Password/OTP flow

The actual UI and API are built primarily around password/OTP, not Azure-only.

Login UI (`components/auth/login-screen.tsx`) supports:

- email/password sign-in
- first-time access OTP request
- forgot-password OTP request
- OTP verification

Password auth behavior (`services/auth-service.ts`):

- `authorizePasswordUser(email, password)`
  - finds active internal user by email
  - rejects unknown/inactive users
  - rejects users with no password hash or `passwordResetRequired=true`
  - verifies scrypt hash
  - updates `lastLoginAt`
  - writes audit logs

OTP behavior:

- `requestOtpChallenge({ email, purpose, requesterKey })`
  - rate-limited by email and requester key
  - returns a generic success response even for unknown users
  - creates `AuthOtpChallenge` rows with hashed code and resend cooldown
  - sends OTP email if the user is eligible
- `authorizeOtpUser({ email, code, purpose, requesterKey })`
  - verifies OTP
  - consumes challenge
  - sets `passwordResetRequired = true`
  - returns an authenticated user whose session still requires password setup
- `setPasswordForUser({ userId, password })`
  - validates password strength
  - stores scrypt password hash
  - clears `passwordResetRequired`
  - sets `passwordSetAt`, `emailVerifiedAt`, `lastLoginAt`

Password rules (`lib/password-auth.ts`):

- minimum 12 chars
- at least one lowercase
- at least one uppercase
- at least one digit
- at least one special character

### Session behavior

NextAuth session strategy is JWT.

JWT/session enrichment:

- attaches `user.id`, `user.role`, `permissions`, `passwordSetupRequired`
- recalculates permissions from DB-backed `roleAccess`
- tracks `lastActivityAt`
- marks `expiresByInactivity` when timeout is exceeded

`requireAppSession()`:

- redirects unauthenticated users to `/login`
- redirects pending password-setup users to `/auth/set-password`
- redirects forbidden users to `/forbidden`

`requireApiSession()` throws `AppError`s instead of redirecting.

## RBAC and permissions

Roles:

- `PROGRAM_HEAD`
- `ADMIN`
- `OPERATIONS`

Default permissions (`lib/constants.ts` / `lib/rbac.ts`):

- `PROGRAM_HEAD`
  - `timesheets:read:self`
  - `timesheets:write:self`
  - `timesheets:submit:self`
  - `timesheets:request-edit:self`
- `ADMIN`
  - `timesheets:read:self`
  - `reports:read:admin`
  - `reports:export:admin`
  - `edit-requests:review`
  - `jobs:run`
  - `configuration:manage`
- `OPERATIONS`
  - `timesheets:read:self`
  - `reports:read:admin`
  - `reports:export:admin`
  - `jobs:run`

Role permissions can be overridden from `SystemConfiguration.roleAccess`.

## Database schema

Prisma schema models:

- `User`
  - identity, role, password/activation fields, Azure fields, activity state
  - optional `approverUserId`
- `Project`
  - active sub-program catalog
- `Timesheet`
  - one per user per month
  - stores status, leave days, working days, assigned hours, optimistic `version`, edit window metadata
- `TimesheetEntry`
  - individual dated entries with project, hours, description
- `EditRequest`
  - reopen/unfreeze workflow
- `EmailLog`
  - message log with attempts and send status
- `AuditLog`
  - audit trail
- `AuthOtpChallenge`
  - OTP issuance/verification state
- `SystemConfiguration`
  - reminder schedule, role access, email templates, holidays, support email, etc.

Enums:

- `UserRole`
- `TimesheetStatus`
- `EditRequestStatus`
- `EmailLogStatus`
- `AuthOtpPurpose`

Current timesheet statuses:

- `DRAFT`
- `SUBMITTED`
- `AUTO_SUBMITTED`
- `FROZEN`
- `EDIT_REQUESTED`
- `EDIT_APPROVED`
- `REJECTED`
- `RESUBMITTED`

## Current timesheet domain behavior

Core math and validation live in `lib/timesheet-calculations.ts` and `lib/workflow-rules.ts`.

### Derived hours

- `assignedHours = max(0, workingDaysCount * 8 - leaveDays * 8)`
- working days are computed in IST using:
  - month
  - join date
  - exit date
  - holiday calendar
  - weekends excluded

### Validation rules

- leave days must be a whole number >= 0
- entry hours must be finite and > 0
- entry hours must be in `0.25` increments
- daily total per date cannot exceed `24`
- total recorded hours cannot exceed assigned hours
- submit mode requires at least one entry
- submit mode requires description on every entry
- submit mode requires exact 100% completion

### Editability rules

- historical months are never editable
- `DRAFT` is editable unless it is the previous month on/after the cutoff
- `EDIT_APPROVED` is editable only until `editWindowClosesAt`
- all other statuses are locked

### Submission rules

- exact completion is required
- `EDIT_APPROVED` can be resubmitted before edit window closes
- `DRAFT` can be submitted only for current month or previous month before cutoff

### Edit request rules

- only previous month can be reopened
- request allowed from:
  - `SUBMITTED`
  - `AUTO_SUBMITTED`
  - `FROZEN`
  - `REJECTED`
- request is blocked if one is already pending

### Edit expiry rule

- `EDIT_APPROVED` expires back to `FROZEN` when current time passes `editWindowClosesAt`

## Time and scheduler rules

`lib/time.ts` is IST-centric.

Key behaviors:

- month keys use `yyyy-MM` in `Asia/Kolkata`
- auto-submit moment is exactly 5th day, 12:00 AM IST
- reminder schedule defaults:
  - current month draft reminders: 25th, 28th
  - current month submit reminder: last day
  - previous month pending reminder: 3rd
  - 5th final notice handled separately

Working-day edit window:

- `addWorkingDaysFromNextBusinessDay(reference, 3, holidays)`
- approval opens editing until end of the 3rd working day after the next business day

Scheduler bootstrap:

- `instrumentation.ts` starts the scheduler only when:
  - runtime is Node.js
  - `ENABLE_SCHEDULER=true`

Cron:

- `services/scheduler-service.ts`
- runs daily at `0 0 * * *` in `Asia/Kolkata`

## Main business service: `services/timesheet-service.ts`

This is the core domain service.

Important exported functions:

- `ensureWindowTimesheets(userId, reference)`
  - upserts current and previous month timesheets
- `createTimesheetForUser(userId, monthKey, reference)`
  - only allows current or previous month
- `listTimesheetsForUser(userId, reference)`
  - ensures current/previous exist, then returns up to 12 months
- `getTimesheetForActor(timesheetId, actor, reference)`
  - access checks + available projects + window navigation metadata
- `saveDraftTimesheet(...)`
  - optimistic concurrency via `version`
  - recalculates working/assigned hours
  - validates in draft mode
  - reconciles entry insert/update/delete in one transaction
  - increments timesheet version
  - clears rejection reason
  - writes audit log
- `submitTimesheet(...)`
  - validates in submit mode
  - enforces submit rules
  - next status:
    - auto => `AUTO_SUBMITTED`
    - manual from `EDIT_APPROVED` => `RESUBMITTED`
    - normal manual => `SUBMITTED`
  - sets `submittedAt`, `frozenAt`, clears edit window
  - writes audit log
- `requestEdit(...)`
  - creates `EditRequest`
  - sets timesheet to `EDIT_REQUESTED`
  - approvers are:
    - assigned `approverUserId`, if present
    - otherwise all active admins
- `listPendingEditRequests()`
- `approveEditRequest(...)`
  - marks request `APPROVED`
  - computes editable-until date
  - sets timesheet to `EDIT_APPROVED`
- `rejectEditRequest(...)`
  - marks request `REJECTED`
  - sets timesheet to `REJECTED`
  - stores `rejectionReason`
- `expireApprovedEditWindows(reference)`
  - turns expired `EDIT_APPROVED` timesheets into `FROZEN`
  - marks approved requests as `EXPIRED`
- `getDashboardData(userId, reference)`
- `ensurePreviousMonthTimesheetsForAllProgramHeads(reference)`
- `getTimesheetEmailContext(timesheetId, reference)`

Important implementation details:

- Timesheet creation is lazy/upsert based.
- `createOrRefreshTimesheet()` creates previous-month sheets as `FROZEN` if the sheet is first created on/after the auto-submit date.
- `reconcileEntries()` validates all incoming project IDs against active projects.
- Entry dates must start with the target `monthKey`.
- The service builds a simple HTML project-hours breakdown used in emails.

## Jobs and automation

`services/job-service.ts` contains three flows:

### `runAutoSubmitJob(reference)`

- throws unless the timestamp is exactly 5th day 12:00 AM IST
- ensures previous-month timesheets exist for all active program heads
- for each previous-month timesheet:
  - if eligible for auto-submit:
    - calls `submitTimesheet(..., method: "auto")`
    - sends submission confirmation email
    - optionally emails all admins
    - sends final success notice
  - else if still `DRAFT`:
    - freezes timesheet
    - sends final failure notice

### `runReminderJob(reference)`

- resolves reminder kind from config and IST date
- skips work if there is no scheduled reminder or if the kind is `FINAL_NOTICE_5TH`
- loads all active `PROGRAM_HEAD` users
- ensures current/previous window timesheets exist
- sends reminders only when `isEligibleForReminder(...)` allows them

### `runDailyAutomation(reference)`

- always expires approved edit windows first
- then:
  - on exact auto-submit moment => runs auto-submit job
  - otherwise => runs reminder job

## Email implementation

Email sending is centralized in `services/email-service.ts`.

Behavior:

- every email creates an `EmailLog` row first
- SMTP transport is cached
- if SMTP config is missing:
  - email content is still logged
  - row becomes `FAILED`
  - business flow continues
- retries on send failure with delays `[1000, 2000, 4000]`

Template system:

- default templates live in `emails/templates.ts`
- templates are token-based subject/html/text definitions
- DB config can override templates
- safe preview rendering exists for the admin template editor

Email categories currently sent:

- OTP emails
- reminder emails
- final 5th-day success/failure notices
- submission confirmation
- edit request alert to approvers
- edit approval/rejection decision
- admin auto-submit notice

## Reporting and export implementation

Reports (`services/report-service.ts`):

- `getComplianceReport(monthKey?)`
- `getHoursUtilizationReport(monthKey?)`
- `getEditRequestReport()`

Exports (`services/export-service.ts`):

- supported report types:
  - `compliance`
  - `hours-utilization`
  - `edit-requests`
- supported formats in code:
  - `pdf`
  - `csv`
  - `excel` is accepted by route typing but currently falls through to CSV behavior

PDF generation:

- `pdfkit`
- simple text/table-like output

CSV generation:

- manual string builder

## UI / page implementation

### App-level routing

- `/` -> redirects based on authenticated role or to `/login`
- `/login` -> password/OTP login screen
- `/auth/set-password` -> authenticated password creation/reset screen
- `/dashboard` -> program head dashboard
- `/timesheets/[id]` -> timesheet editor/view
- `/timesheets/[id]/confirmation` -> post-submit confirmation page
- `/admin` -> admin/operations dashboard
- `/admin/edit-requests` -> pending edit request review UI
- `/admin/reports` -> reports and export UI
- `/forbidden` -> access denied page

### Shell/layout

- `app/layout.tsx`
  - global fonts: Manrope + JetBrains Mono
  - wraps app in `SessionProvider` and `ToastProvider`
- `components/common/portal-shell.tsx`
  - left nav shell
  - nav items shown from permission list
  - sign out uses NextAuth signOut

### Login flow UI

`components/auth/login-screen.tsx`:

- view state machine:
  - `login`
  - `activate`
  - `forgot`
  - `verify-otp`
- password sign-in calls `signIn("password-login", ...)`
- OTP verify calls `signIn("email-otp", ...)`
- OTP request is done through `/api/v1/auth/request-otp`

### Set password UI

`components/auth/set-password-screen.tsx`:

- posts to `/api/v1/auth/set-password`
- best-effort stores browser password credential via `navigator.credentials`

### Dashboard

`app/dashboard/page.tsx`:

- SSR page for `PROGRAM_HEAD`
- uses `getDashboardData()`
- shows:
  - current timesheet progress
  - previous month status
  - upcoming deadlines
  - pie-chart allocation breakdown
  - historical submission cards

### Timesheet editor

`components/timesheets/timesheet-editor.tsx` is the main client editor.

Current behavior:

- local client state mirrors server timesheet
- reads local backup from `localStorage`
- auto-save debounce: 2400ms
- auto-save storage key: `timesheet-draft:<timesheetId>`
- manual save uses same bulk PATCH endpoint
- submit button only renders when:
  - sheet is editable
  - client-side computed exact completion is true
- edit request opens modal and posts reason
- supports desktop table and mobile card layouts
- supports add/remove/update entries entirely on client

Client-side save flow:

- bulk PATCH to `/api/v1/timesheets/:id`
- sends:
  - `leaveDays`
  - `version`
  - entire `entries[]`
- temp client IDs are stripped before POST

Auto-save hook (`hooks/use-autosave.ts`):

- persists every value change to localStorage immediately
- debounces save
- uses retry helper `lib/autosave.ts`
- warns on page unload if current value differs from last persisted server snapshot

## Current API surface

### Auth / session

- `POST /api/v1/auth/login`
  - informational endpoint returning auth mode and URLs
  - does not perform the actual sign-in itself
- `POST /api/v1/auth/request-otp`
  - request OTP for `FIRST_LOGIN`, `FORGOT_PASSWORD`, or `ACCOUNT_ACTIVATION`
- `POST /api/v1/auth/resend-otp`
  - re-export of request-otp route
- `POST /api/v1/auth/set-password`
  - requires authenticated session, but allows pending-password-setup users
- `GET /api/v1/auth/session`
  - returns auth mode and current session user if present
- `POST /api/v1/auth/logout`
  - informational endpoint returning signout URL and callback URL
- `GET|POST /api/auth/[...nextauth]`
  - actual NextAuth handler

### Timesheets

- `GET /api/v1/timesheets`
  - list current user's timesheets
- `POST /api/v1/timesheets`
  - create current/previous month timesheet
- `GET /api/v1/timesheets/:id`
  - get a specific timesheet view + projects + window timesheets
- `PATCH /api/v1/timesheets/:id`
  - bulk draft save
- `POST /api/v1/timesheets/:id/submit`
  - manual submit + confirmation email
- `POST /api/v1/timesheets/:id/edit-request`
  - create edit request + notify approvers
- `POST /api/v1/timesheets/:id/entries`
  - add one entry by rebuilding the whole draft state

### Entries

- `PATCH /api/v1/entries/:id`
  - update one entry by loading parent timesheet and resaving full draft
- `DELETE /api/v1/entries/:id`
  - delete one entry by loading parent timesheet and resaving full draft

Note: current UI does not use the entry-specific routes; it uses the bulk timesheet PATCH route.

### Edit requests

- `GET /api/v1/edit-requests`
  - list pending requests
- `POST /api/v1/edit-requests/:id/approve`
  - approve + open edit window + email requester
- `POST /api/v1/edit-requests/:id/reject`
  - reject + lock sheet + email requester

### Reports

- `GET /api/v1/reports/compliance`
- `GET /api/v1/reports/hours-utilization`
- `GET /api/v1/reports/edit-requests`
- `POST /api/v1/reports/export`

### Jobs

- `POST /api/v1/jobs/auto-submit`
- `POST /api/v1/jobs/send-reminders`

Job auth:

- accepts `x-job-secret` matching `CRON_JOB_SHARED_SECRET`
- otherwise requires authenticated user with `jobs:run`

### Health

- `GET /api/health`
  - raw DB reachability check via `SELECT 1`

## Route-handler wrapper behavior

`lib/api-route.ts` provides:

- auth gating
- optional role/permission enforcement
- optional same-origin check
- in-memory rate limiting
- error capture via observability

Important note:

- rate limiting is purely in-memory (`lib/rate-limit.ts`)
- it is process-local and not distributed

## Admin implementation

### Admin dashboard (`/admin`)

- requires `reports:read:admin`
- loads:
  - compliance report
  - edit request report
  - system configuration
  - program heads
  - admins
- shows KPI cards and small overview lists
- only renders configuration panel if current role has `configuration:manage`

### Edit request review (`/admin/edit-requests`)

- requires `edit-requests:review`
- renders pending requests with approve/reject actions
- reject action uses modal with mandatory reason

### Reports page (`/admin/reports`)

- requires `reports:read:admin`
- shows three report sections
- export buttons trigger `/api/v1/reports/export`

### Configuration panel

Current editable settings in UI:

- inactivity timeout
- support contact email
- current-month reminder days
- next-month reminder days
- holiday calendar
- full email template JSON payload via hidden field managed by template editor
- role access JSON
- admin auto-submit notification toggle

Also includes program-head -> approver mapping form.

Non-editable/fixed-in-practice settings:

- auto-submit day is shown as fixed
- completion threshold is shown as fixed

## Seed data

`prisma/seed.ts` creates:

- projects:
  - `LIV` / Livable Cities
  - `DEM` / Democratic Accountability
  - `RUR` / Rural Systems
- users:
  - `girija.admin@janaagraha.org`
  - `kishora.admin@janaagraha.org`
  - `mira.operations@janaagraha.org`
  - `anita.director@janaagraha.org`
  - `ravi.director@janaagraha.org`

Seed password:

- `Jana@Timesheet2026`

Seed nuances:

- Ravi is intentionally left without a password for activation testing
- Anita has current-month `DRAFT`, previous-month `SUBMITTED`, older `AUTO_SUBMITTED`
- Ravi previous month is seeded as `EDIT_REQUESTED` with a pending `EditRequest`
- sample `EmailLog` and `AuditLog` rows are added

## Tests currently present

Unit tests cover:

- auth service OTP/password flows
- autosave retry behavior
- edit-request lifecycle rules
- password hashing and OTP helpers
- reminder configuration
- RBAC
- session timeout
- timesheet calculations
- workflow rules

Vitest coverage is configured for:

- `lib/**/*.ts`
- `services/**/*.ts`
- `hooks/**/*.ts`

## Important implementation-specific quirks

- The app is currently built around password/OTP auth first; Azure AD is optional by env, not the only path.
- `POST /api/v1/auth/login` and `POST /api/v1/auth/logout` are metadata/helper endpoints, not actual login/logout executors.
- Timesheet editing in the UI is bulk-save oriented; single-entry API routes exist but are not the primary path.
- Auto-submit only runs at an exact timestamp, not a date window.
- Reminder scheduling is date-driven and IST-specific.
- Role access and email templates are dynamically configurable from DB-backed JSON.
- Rate limiting is in-memory only.
- Report export advertises Excel/CSV in the UI label, but actual implementation emits CSV for non-PDF exports.
- SMTP absence does not block business actions; the system logs failed email attempts instead.

## Most likely files to change for future requests

- Auth behavior:
  - `lib/auth.ts`
  - `services/auth-service.ts`
  - `components/auth/login-screen.tsx`
  - `components/auth/set-password-screen.tsx`
- Timesheet rules/calculations:
  - `lib/timesheet-calculations.ts`
  - `lib/workflow-rules.ts`
  - `lib/time.ts`
  - `services/timesheet-service.ts`
- Timesheet UI:
  - `components/timesheets/timesheet-editor.tsx`
  - `components/timesheets/request-edit-modal.tsx`
  - `app/timesheets/[id]/page.tsx`
- Scheduler/reminders/auto-submit:
  - `services/job-service.ts`
  - `services/scheduler-service.ts`
  - `instrumentation.ts`
- Reports/exports:
  - `services/report-service.ts`
  - `services/export-service.ts`
  - `app/admin/reports/page.tsx`
  - `components/admin/report-export-actions.tsx`
- Admin config and approval workflow:
  - `app/admin/actions.ts`
  - `components/admin/configuration-panel.tsx`
  - `components/admin/email-template-manager.tsx`
  - `components/admin/edit-request-table.tsx`
- API contract changes:
  - relevant files under `app/api/v1/**`
- Schema/data-model changes:
  - `prisma/schema.prisma`
  - `prisma/migrations/**`
  - `prisma/seed.ts`

## Prompt-ready summary for a follow-up change request

You should treat the current codebase as:

- a single Next.js full-stack app
- Prisma/Postgres-backed
- permission-driven
- password/OTP-first with optional Azure AD mode
- centered around `services/timesheet-service.ts` as the main business layer
- using bulk timesheet draft save with optimistic `version` checking
- using DB-configurable reminders, email templates, holiday calendar, and role-access overrides
- using an exact IST-based 5th-day cutoff for auto-submit/freeze logic

When implementing any change request, prefer updating the service layer first, then route handlers, then the relevant page/component layer, and keep Prisma schema + seed + tests aligned if the behavior or data model changes.
```
