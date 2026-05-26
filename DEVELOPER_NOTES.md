# Developer Notes

This file is for maintainers. It describes the implementation that exists in the codebase today and highlights a few places where runtime behavior is narrower or broader than the editable configuration suggests.

## Source Of Truth

When documentation and code disagree, use these files first:

- Environment and auth mode: [lib/env.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/env.ts)
- Constants, roles, permissions, and defaults: [lib/constants.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/constants.ts)
- Date and scheduler rules: [lib/time.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/time.ts)
- Workflow gates: [lib/workflow-rules.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/workflow-rules.ts)
- Timesheet validation and capacity math: [lib/timesheet-calculations.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/timesheet-calculations.ts)
- Core workflow orchestration: [services/timesheet-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/timesheet-service.ts)
- Jobs: [services/job-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/job-service.ts)
- Reporting and export: [services/report-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/report-service.ts), [services/export-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/export-service.ts)
- Schema: [prisma/schema.prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/schema.prisma)

## Current Architectural Shape

- App Router pages render most views on the server and delegate interaction-heavy pieces to client components.
- JSON APIs live under `/api/v1` and are wrapped by [lib/api-route.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/api-route.ts).
- Services own persistence, workflow transitions, and side effects.
- Route handlers stay thin: read input, enforce auth and origin rules, call a service, return standardized JSON.
- The scheduler is process-local and is started from [instrumentation.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/instrumentation.ts) only when `ENABLE_SCHEDULER=true`.

## Auth And Session Model

### What Is Active Today

- Password login plus OTP-based activation/reset is the default runtime path.
- OTP verification signs the user in but leaves `passwordSetupRequired=true` until a new password is saved.
- The set-password route is the only route that intentionally allows an authenticated session with pending password setup.
- Azure AD support is still present and can be enabled with `AUTH_MODE=azuread`.

### Important Files

- Providers and session shaping: [lib/auth.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/auth.ts)
- Password and OTP primitives: [lib/password-auth.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/password-auth.ts)
- Auth workflow service: [services/auth-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/auth-service.ts)

### Session Details

- Sessions use NextAuth JWT strategy, not a database session table.
- Inactivity timeout is read from `SystemConfiguration.inactivityTimeoutMins` during JWT callback refresh.
- If inactivity expires, the session is marked with `expiresByInactivity` and the UI redirects back to `/login?reason=session-expired`.

## Domain Notes

### User And Role Model

- `PROGRAM_HEAD` and `ASSOCIATE_DIRECTOR` are both treated as timesheet owners.
- Approver mapping is a self-reference on `User.approverUserId`.
- If no explicit approver is mapped, edit-request notifications fall back to active admins.

### Timesheet Storage Model

- `Timesheet` stores month-level state and cached capacity values.
- `Timesheet.monthKey` remains a `YYYY-MM` label. Actual valid work dates are derived in [lib/time.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/time.ts): the previous month's 20th inclusive through the labelled month's 20th exclusive. Example: `2026-05` covers 20 Apr 2026 through 19 May 2026.
- `Timesheet.monthStart` remains the first day of the labelled month for backward-compatible anchoring, not the payroll period start.
- `TimesheetEntry` is the actual day-level source of recorded work.
- `TimesheetDayState` stores per-date leave or manual-holiday state.
- `leaveDays` is retained on `Timesheet`, but effective capacity is recalculated from day-state data whenever needed.
- There is no separate row-level edit-history model beyond audit logs.

### Reporting Model

- Compliance and utilization reports scope to timesheet-owner roles.
- Edit-request reporting also scopes to timesheet-owner requesters only.
- Export generation is synchronous and happens inside the request path.

## Workflow Rules That Matter

- Entry resolution is 10-minute increments.
- The editor normalizes decimal-hour input to the nearest valid 10-minute value within a small tolerance.
- Exact equality of `totalMinutes === assignedMinutes` is required for submission.
- Daily capacity is reduced by:
  - weekends
  - holiday calendar entries
  - join and exit dates
  - manual holidays
  - half-day and full-day leave
- `day` mode is the persisted source of truth.
- `week` and `month` helpers generate or overwrite day rows rather than storing separate aggregates.

## Scheduler And Automation

- Cron schedule is hard-coded as `0 0 * * *` in `Asia/Kolkata`.
- Every run expires approved edit windows first.
- Only the exact 25th of the labelled month at `00:00 IST` is treated as the auto-submit window for that labelled period.
- Reminder logic uses `SystemConfiguration.reminderDays`.
- Auto-submit notices and final notices are sent through the email service and logged in `EmailLog`.

## API Conventions

- Protected routes use `handleApiRoute`.
- Public auth routes use `handlePublicApiRoute`.
- Rate limiting is applied in-process using an in-memory `Map`, so limits are per application instance.
- Same-origin checks are opt-in per route and compare against `APP_BASE_URL`.
- Job endpoints allow either an authorized session with `jobs:run` or the `x-job-secret` header.

## Current Implementation Caveats

These are the main places where the codebase can surprise future maintainers.

- `lib/env.ts` and `prisma/schema.prisma` are the real env-variable sources of truth.
- `.env.example` currently contains legacy drift:
  - it still mentions `LOCAL_AUTH_ENABLED`, which the current runtime does not read
  - it does not describe `AUTH_MODE`
  - it does not describe `DIRECT_URL`, even though Prisma schema references it
- `SystemConfiguration.autoSubmitDay` exists in the schema, but runtime/display logic normalizes the cutoff to the fixed 25th in [lib/time.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/time.ts) and [services/configuration-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/configuration-service.ts).
- `SystemConfiguration.completionThreshold` exists and is editable, but submission and auto-submit still require exact minute equality rather than using that threshold.
- `services/export-service.ts` accepts `"excel"` in its type union, but non-PDF exports are currently CSV output.
- `canRequestEdit` is broader than `canEditTimesheet`:
  - request eligibility checks any past month
  - actual editability still blocks historical months before the `EDIT_APPROVED` branch is reached
  - if this is unintended, align [lib/workflow-rules.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/workflow-rules.ts) before changing docs or UI copy
- Health check coverage is intentionally small and only proves the app can reach the database.
- Rate limiting is not shared across instances, so deployed behavior depends on topology.

## Seed Data Notes

- The seed script creates a small local dataset with owners, admins, operations, projects, timesheets, a pending edit request, and sample logs.
- One seeded owner is intentionally left without a password to exercise the activation flow.
- The seed script prints local-only credentials to stdout. Do not copy that output into docs, tickets, or shared channels.
- Keep seed data assumptions in sync with [prisma/seed.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/seed.ts).

## Safe Change Boundaries

If you need to update behavior, these are the usual places:

- Change capacity or validation math in [lib/timesheet-calculations.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/timesheet-calculations.ts).
- Change status gating in [lib/workflow-rules.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/workflow-rules.ts).
- Change workflow side effects in [services/timesheet-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/timesheet-service.ts).
- Change reminder or cutoff timing in [lib/time.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/time.ts) and [services/job-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/job-service.ts).
- Change role behavior in [lib/constants.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/constants.ts), [lib/rbac.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/rbac.ts), and the admin configuration layer.

## Verification Guidance

Useful commands after any logic change:

```bash
npm run lint
npm test
npm run build
```

High-value manual checks:

1. Password login, OTP activation, forgot-password, and set-password flow.
2. Current-month day editing with autosave and refresh recovery.
3. Week and month allocation overwrite behavior.
4. Leave and manual-holiday capacity changes.
5. Manual submit, auto-submit, freeze, and edit-request transitions.
6. Admin oversight, report export, and pending edit-request review.
