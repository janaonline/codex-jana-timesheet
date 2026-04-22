# Directors Timesheet Management System

This repository contains a single Next.js application for managing internal timesheet capture, approvals, reminders, exports, and supporting admin operations.

This README is based on the current source code, not earlier project assumptions. It intentionally omits secrets, sample passwords, and environment values.

## Current Snapshot

- Framework: Next.js 15 App Router
- Language: TypeScript
- UI: React 19 and Tailwind CSS 4
- Data: Prisma ORM with PostgreSQL
- Auth: NextAuth with password/OTP flow by default, plus optional Azure AD / Entra ID mode
- Background work: `node-cron`
- Email: Nodemailer
- Exports: PDFKit and CSV generation
- Tests: Vitest

## Dark Mode

The application has full dark mode support across all user-facing routes.

**Route coverage:** `/login`, `/auth/set-password`, `/dashboard`, `/timesheets/[id]`, `/timesheets/[id]/confirmation`, `/admin`, `/admin/edit-requests`, `/admin/reports`. The `/forbidden` and error pages are intentionally dark in both modes by design.

**Persistence:** The active theme is stored in `localStorage` under the key `"theme"` (`"light"` or `"dark"`). On first visit, falls back to the OS preference via `prefers-color-scheme`. Theme is restored before the first paint via a synchronous inline script in `<head>` — no flash on reload.

**Architecture:**
- `app/globals.css` defines all semantic CSS custom properties: `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-subtle`, `--color-text-muted`, `--color-text-placeholder`, `--color-primary`, `--color-primary-hover`, `--color-primary-ring`, `--color-error-bg`, `--color-error-border`, `--color-error-text`. The `.dark` class overrides all tokens.
- `@custom-variant dark (&:where(.dark, .dark *))` enables the standard `dark:` prefix throughout.
- `components/common/theme-provider.tsx` manages React state; `components/common/theme-toggle.tsx` provides the toggle button (sun/moon icons, no icon library dependency).
- The toggle appears in the sidebar header on authenticated pages and fixed top-right on the login and set-password pages.

**Guidance for new UI code:**
- Use `text-(--color-text)`, `bg-(--color-surface)`, `border-(--color-border)`, etc. for structural elements. Do not hardcode `text-stone-*`, `bg-white`, `bg-stone-*`, or `border-stone-*`.
- For semantic status colors (e.g. badge, toast, calendar cells) that require multiple hues, use explicit `dark:` prefix pairs (e.g. `bg-emerald-50 dark:bg-emerald-950`).
- Never use `bg-stone-100` as a surface without pairing it with a `dark:bg-stone-800` override.

**Manual verification steps:**
1. Toggle dark/light on `/login` — card, form fields, and button adapt.
2. Sign in → sidebar, nav, user card, and page content adapt.
3. Visit `/timesheets/[id]` → calendar cells, forms, sticky summary, and view tabs adapt.
4. Hard refresh a dark-mode route → no flash, theme persists.
5. Open a private window → OS preference is respected.

## What The Application Does

- Gives timesheet owners a dashboard for the current month, previous month, and recent history.
- Supports day-level entry editing with autosave and local draft backup.
- Supports week and month allocation helpers that generate day-level rows.
- Tracks working capacity by business day, leave, manual holiday, join date, and exit date.
- Requires exact completion before manual submission or auto-submission.
- Runs reminder and cutoff automation in `Asia/Kolkata`.
- Provides an edit-request workflow for locked past-month sheets.
- Gives admins and operations users reporting and oversight screens.
- Stores audit logs and email logs in the application database.

## Roles In The Current Codebase

- `PROGRAM_HEAD`: owns and submits personal timesheets.
- `ASSOCIATE_DIRECTOR`: treated as a timesheet owner role alongside `PROGRAM_HEAD`.
- `ADMIN`: can review edit requests, access reports, run jobs, and manage configuration.
- `OPERATIONS`: can access reports and jobs, but does not get edit-request review or configuration management by default.

Role permissions come from the default matrix in [lib/constants.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/constants.ts) and can be overridden through `SystemConfiguration.roleAccess`.

## Main User Flows

### Authentication

- `/login` is the current sign-in entry point.
- The default runtime mode is password login with OTP-based first-time activation and password reset.
- `/auth/set-password` is used after OTP verification when a user still needs to create a password.
- Azure AD / Entra ID sign-in is available only when `AUTH_MODE=azuread` and the Azure settings are present.

### Timesheet Capture

- `/dashboard` shows current progress, previous-month status, deadlines, allocation breakdown, and recent history.
- `/timesheets/[id]` hosts the editor.
- The editor has three working modes:
  - `day`: direct row editing and the source of truth.
  - `week`: evenly distributes a total across weekdays in the selected week.
  - `month`: evenly distributes a total across valid working dates in the month.
- Calendar state supports:
  - `NONE`
  - `HALF_DAY`
  - `FULL_DAY`
  - manual holiday
- Time entry resolution is 10-minute increments, not quarter-hour increments.

### Submission And Edit Requests

- Manual submission is allowed only when total recorded minutes exactly equal assigned minutes.
- Previous-month drafts are evaluated at `12:00 AM IST` on the 5th:
  - exact completion -> `AUTO_SUBMITTED`
  - otherwise -> `FROZEN`
- Approved edit requests create a temporary edit window and later expire back to `FROZEN`.

### Admin Surface

- `/admin`: operational oversight, reminder configuration, holiday calendar, support email, role-access JSON, and approver mapping.
- `/admin/edit-requests`: pending edit-request review.
- `/admin/reports`: compliance, hours-utilization, and edit-request reports plus exports.

## Architecture At A Glance

- [app](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/app): App Router pages, layouts, route handlers, and server actions.
- [components](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/components): reusable UI pieces for auth, timesheets, admin, and common controls.
- [services](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services): business workflows, reporting, exports, jobs, email, and auth logic.
- [lib](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib): shared rules, validation, RBAC, time helpers, API wrappers, and runtime config helpers.
- [prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma): schema, migrations, and seed script.
- [tests/unit](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/tests/unit): focused business-rule and service tests.

## Important Runtime Files

- Auth setup: [lib/auth.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/auth.ts)
- Environment parsing: [lib/env.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/env.ts)
- Timesheet rules: [lib/timesheet-calculations.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/timesheet-calculations.ts), [lib/workflow-rules.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/workflow-rules.ts), [lib/time.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/time.ts)
- Core workflow service: [services/timesheet-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/timesheet-service.ts)
- Jobs and scheduler: [services/job-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/job-service.ts), [services/scheduler-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/scheduler-service.ts), [instrumentation.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/instrumentation.ts)
- Reports and exports: [services/report-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/report-service.ts), [services/export-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/export-service.ts)
- Data model: [prisma/schema.prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/schema.prisma)

## Data Model Summary

The main persisted entities are:

- `User`: role, auth state, approver mapping, employment window.
- `Project`: sub-program catalog used in timesheet entries.
- `Timesheet`: month-level status, assigned capacity, derived totals, edit-window metadata.
- `TimesheetEntry`: day-level project allocations and descriptions.
- `TimesheetDayState`: leave and manual-holiday state per date.
- `EditRequest`: review workflow for reopening locked sheets.
- `SystemConfiguration`: reminder days, holiday calendar, inactivity timeout, role-access overrides, and email template data.
- `EmailLog` and `AuditLog`: operational trace records.
- `AuthOtpChallenge`: OTP lifecycle for activation and reset flows.

## Environment Variables

Use [lib/env.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/env.ts) and [prisma/schema.prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/schema.prisma) as the source of truth for active configuration.

Core variables:

- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AUTH_MODE`
- `APP_BASE_URL`
- `CRON_JOB_SHARED_SECRET`
- `ENABLE_SCHEDULER`
- `SUPPORT_CONTACT_EMAIL`
- `HOLIDAY_CALENDAR_JSON`
- `OBSERVABILITY_WEBHOOK_URL`

Conditional variables:

- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `AZURE_AD_PROGRAM_HEAD_GROUP_ID`
- `AZURE_AD_ADMIN_GROUP_ID`
- `AZURE_AD_OPERATIONS_GROUP_ID`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`

Notes:

- `AUTH_MODE=password` is the default behavior in code.
- If SMTP is not configured, workflow actions still complete but email logs are recorded as failed.
- Avoid copying values from local env files into documentation, tickets, or screenshots.

## Local Development

Install dependencies:

```bash
npm install
```

If you want to use Prisma's local dev database helper:

```bash
npm run db:local:start
npm run db:local:status
```

Generate the Prisma client and apply migrations:

```bash
npm run db:generate
npm run db:deploy
```

Seed local data:

```bash
npm run db:seed
```

Start the app:

```bash
npm run dev
```

Useful alternatives:

```bash
npm run db:migrate
npm run db:local:stop
npm run build
npm run start
```

The seed script creates sample data for local workflow testing. It also prints local-only credential details to stdout, so treat seed output as sensitive.

## Background Automation

- The scheduler starts through [instrumentation.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/instrumentation.ts) when `ENABLE_SCHEDULER=true`.
- The cron expression is `0 0 * * *` in `Asia/Kolkata`.
- Every daily run first expires edit windows.
- On the 5th at midnight IST, the run performs auto-submit or freeze logic.
- On other eligible dates, the run sends reminder emails.
- Manual job triggers:
  - `POST /api/v1/jobs/auto-submit`
  - `POST /api/v1/jobs/send-reminders`
- Job routes accept either:
  - an authenticated user with `jobs:run`
  - or the `x-job-secret` header matching `CRON_JOB_SHARED_SECRET`

Only one deployed instance should have `ENABLE_SCHEDULER=true`.

## Reports And Exports

Implemented report types:

- compliance
- hours utilization
- edit requests

Export behavior:

- UI offers `PDF` and `Excel/CSV`.
- Backend currently produces either `application/pdf` or CSV output.
- CSV is the spreadsheet-friendly export format in the current implementation.

## API Surface Summary

Auth endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/request-otp`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/set-password`

Authenticated app endpoints:

- `GET/POST /api/v1/timesheets`
- `GET/PATCH /api/v1/timesheets/[id]`
- `POST /api/v1/timesheets/[id]/entries`
- `PATCH /api/v1/entries/[id]`
- `PATCH /api/v1/timesheets/[id]/calendar`
- `POST /api/v1/timesheets/[id]/apply-week`
- `POST /api/v1/timesheets/[id]/apply-month`
- `POST /api/v1/timesheets/[id]/submit`
- `POST /api/v1/timesheets/[id]/edit-request`
- `GET /api/v1/edit-requests`
- `POST /api/v1/edit-requests/[id]/approve`
- `POST /api/v1/edit-requests/[id]/reject`
- `GET /api/v1/reports/compliance`
- `GET /api/v1/reports/hours-utilization`
- `GET /api/v1/reports/edit-requests`
- `POST /api/v1/reports/export`
- `GET /api/health`

## Testing

Primary commands:

```bash
npm test
npm run test:coverage
npm run lint
```

The current unit test suite covers areas such as:

- auth and OTP behavior
- RBAC and session timeout
- autosave and client API helpers
- timesheet calculations and calendar logic
- edit-request lifecycle
- report generation logic
- workflow rules

## Security And Operational Notes

- Page and API access are enforced through `requireAppSession` and `requireApiSession`.
- State-changing routes use same-origin checks where configured through `APP_BASE_URL`.
- Default API rate limiting is in-process memory based.
- Health checks verify database reachability.
- Audit logging and email logging are first-class parts of the app model.
- This document intentionally avoids listing real connection strings, secrets, or seeded credentials.
