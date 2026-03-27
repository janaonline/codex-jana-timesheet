# Directors Timesheet Management System

## Project Overview
This repository contains the MVP implementation of the **Directors Timesheet Management System for Janaagraha**. It is a single Next.js application that combines the responsive web UI, API routes, scheduling logic, reporting, audit logging, email flow, and PostgreSQL persistence required by the requirements document.

The implementation is intentionally lean and stays inside the required stack:
- One Next.js application
- TypeScript
- Built-in API routes
- Tailwind CSS only
- Plain reusable components
- Node.js runtime
- PostgreSQL
- Prisma
- Auth.js (NextAuth) with Microsoft Entra ID / Azure AD
- node-cron with one daily scheduler
- Nodemailer for SMTP or Microsoft mail flow

## Purpose And Problem Statement
The system replaces manual director timesheet handling with a controlled workflow for:
- monthly time capture by program heads
- auto-save and manual draft save
- manual submission before cutoff
- exact 5th-of-month auto-submit in IST for fully complete drafts only
- frozen previous-month sheets that require an edit/unfreeze request
- reminder emails and submission confirmations
- admin oversight, reporting, exports, audit logs, and email logs

## Target Users And Roles
- `PROGRAM_HEAD`: fills and submits timesheets, requests unfreeze/edit for previous-month sheets
- `ADMIN`: reviews edit requests, oversees compliance, manages configuration
- `OPERATIONS`: reviews reports and operational settings, without direct edit approval authority unless granted through role access JSON

## Features In Scope
- Microsoft SSO and RBAC
- Monthly timesheets with daily breakdown
- Hours entry in `0.25` increments
- Leave deduction from assigned hours
- Real-time progress indicators
- Auto-save with retry and local browser fallback
- Manual submit before cutoff
- Auto-submit on the 5th at `12:00 AM IST` for exact 100% completion only
- Freeze behavior after the 5th
- Reminder emails
- Submission confirmation emails
- Edit request / unfreeze workflow
- Program head dashboard
- Admin dashboard
- Compliance, hours utilization, and edit request reports
- PDF and Excel/CSV export
- Audit logs
- Email logs
- Health check
- Seed data for local/UAT use

## Out Of Scope
- Phase 2 enhancements
- Bulk approvals
- Advanced analytics beyond the documented MVP reports
- Native mobile apps
- Scheduled report delivery
- Multi-language support
- External integrations that are still marked as pending in the requirements

## Architecture Overview
### Presentation Layer
- Next.js App Router pages under [app](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/app)
- Tailwind-only styling in [app/globals.css](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/app/globals.css)
- Plain reusable components in [components](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/components)

### Application Layer
- REST JSON APIs under `/api/v1`
- Auth.js configuration in [lib/auth.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/auth.ts)
- Core business services in [services](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services)
- Daily scheduler bootstrap in [instrumentation.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/instrumentation.ts)

### Data Layer
- PostgreSQL schema defined in [prisma/schema.prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/schema.prisma)
- Initial migration in [migration.sql](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/migrations/20260323170000_init/migration.sql)
- UAT seed in [seed.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/seed.ts)

## Project Structure
```text
app/
  admin/
  api/
  dashboard/
  login/
  timesheets/
components/
  admin/
  common/
  dashboard/
  timesheets/
emails/
hooks/
lib/
prisma/
services/
tests/
types/
README.md
DEVELOPER_NOTES.md
OPERATIONS_NOTES.md
TODO_EXTERNAL_INPUTS.md
VERIFICATION_CHECKLIST.md
```

## Data Lifecycle
1. User signs in through Microsoft Entra ID / Azure AD.
2. Auth.js syncs the Azure profile into the required `User` table and maps Azure groups to internal roles.
3. Current and previous month timesheets are created or refreshed on demand.
4. The program head edits daily entries, leave count, and descriptions.
5. Auto-save debounces for roughly 2.4 seconds, retries up to 3 times, and stores a browser backup.
6. Draft saves update Prisma records and write audit logs.
7. Manual submit validates exact completion, required descriptions, and hard-stop rules before locking the sheet.
8. On the 5th at `12:00 AM IST`, the daily scheduler evaluates previous-month drafts:
   - exact 100% draft => `AUTO_SUBMITTED`
   - incomplete draft => `FROZEN`
9. Frozen/submitted previous-month sheets can enter `EDIT_REQUESTED`, then `EDIT_APPROVED` or `REJECTED`.
10. Approved edit windows reopen the sheet for 3 working days, then auto-freeze again without auto-resubmission.
11. Reports and exports read from timesheets, entries, edit requests, audit logs, and email logs.

## Core Business Rules
- `assigned_hours = (working_days × 8) - (leaves × 8)`
- Completion logic uses exact values. No rounding is used for eligibility.
- Hours must be in `0.25` increments.
- Daily total hours cannot exceed `24`.
- Total recorded hours cannot exceed assigned hours.
- Draft save permits blank descriptions.
- Submission requires descriptions and all hard-stop validations to pass.
- No duplicate-prevention logic is applied to timesheet entries.
- No project-level validation beyond the monthly total rule is enforced.
- Historical months are view-only.
- Normal editing supports only the current month and previous month.
- Only the previous month can be reopened through the approved unfreeze workflow.
- The 5th-of-month cutoff is absolute and uses IST.

## Status Lifecycle
- `DRAFT`
- `SUBMITTED`
- `AUTO_SUBMITTED`
- `FROZEN`
- `EDIT_REQUESTED`
- `EDIT_APPROVED`
- `REJECTED`
- `RESUBMITTED`

The implementation keeps `EDIT_APPROVED` distinct from `DRAFT`, as required.

## Reminder Schedule
- 25th of month: reminder to fill timesheet, draft users only
- 28th of month: reminder to continue filling, draft users only
- Last day of month: reminder to submit, draft or completion below 100%
- 3rd of next month: reminder for previous month not submitted
- 5th of next month: final notice success/failure variant handled as part of the cutoff run

## Auto-Submit Rules
- One daily scheduler runs at `0 0 * * *` in `Asia/Kolkata`
- Auto-submit logic runs only when the current time is exactly the 5th at `12:00 AM IST`
- Only previous-month `DRAFT` timesheets with exact 100% completion are auto-submitted
- Incomplete drafts become `FROZEN`
- There is no grace period
- Weekends and holidays do not alter the 5th rule

## Unfreeze Workflow
- Available only on previous-month submitted/frozen/rejected timesheets
- Reason is mandatory and capped at 500 characters
- Request creates an `EditRequest`, emails approvers, and sets timesheet status to `EDIT_REQUESTED`
- Approval sets status to `EDIT_APPROVED`, unlocks the sheet, and opens a 3-working-day window
- Rejection sets request state to rejected and timesheet status to `REJECTED`
- Expired edit windows auto-freeze and lock again
- The system does **not** auto-resubmit when the edit window expires

## Setup Prerequisites
- Node.js `22.x` or equivalent current LTS runtime compatible with Next.js 16
- npm `10+`
- PostgreSQL `14+`
- Microsoft Entra ID / Azure AD application registration
- SMTP credentials or equivalent Microsoft mail flow

## Installation
```bash
npm install
```

## Environment Variables
Copy [`.env.example`](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/.env.example) to `.env.local` or your deployment environment.

Key variables:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
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
- `APP_BASE_URL`
- `CRON_JOB_SHARED_SECRET`
- `ENABLE_SCHEDULER`
- `LOCAL_AUTH_ENABLED`
- `SUPPORT_CONTACT_EMAIL`
- `HOLIDAY_CALENDAR_JSON`
- `OBSERVABILITY_WEBHOOK_URL`

## Local Developer Bootstrap
This workspace is now configured for local development with:
- [`.env.local`](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/.env.local) for the Next.js app
- [`.env`](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/.env) so Prisma CLI can resolve `DATABASE_URL`
- A Prisma local dev database server named `directors-timesheet`
- `LOCAL_AUTH_ENABLED=true` so seeded accounts can exercise the full workflow locally without Azure tenant credentials

Start or re-start the local database service:
```bash
npm run db:local:start
```

Check its status:
```bash
npm run db:local:status
```

## Database Setup And Migrations
Generate Prisma client:
```bash
npm run db:generate
```

Create or update your database locally:
```bash
npm run db:migrate
```

Deploy migrations in production:
```bash
npm run db:deploy
```

## Seed Instructions
```bash
npm run db:seed
```

The seed creates:
- Admin users
- Operations user
- Two program heads
- Sample projects
- Current, previous, and historical timesheets
- One pending edit request
- Sample email and audit logs

Seeded local development sign-in accounts:
- `anita.director@janaagraha.org`
- `ravi.director@janaagraha.org`
- `girija.admin@janaagraha.org`
- `kishora.admin@janaagraha.org`
- `mira.operations@janaagraha.org`

## Local Run Instructions
```bash
npm run db:local:start
npm run db:deploy
npm run db:seed
npm run dev
```

The app uses port `3000` by default. If `3000` is already in use, the local launcher picks an available port and prints the actual local URL in the terminal.

For local-only verification without Azure credentials, use the "Development-only sign-in" panel on `/login`. Production authentication remains Microsoft Entra ID / Azure AD.

## Build Instructions
```bash
npm run build
npm run start
```

Verified in this workspace with:
- `npm run lint`
- `npm test`
- `npm run build`

## Test Instructions
Run the critical automated tests:
```bash
npm test
```

Optional coverage run:
```bash
npm run test:coverage
```

Current automated focus:
- Assigned-hours calculation
- Exact completion logic
- Exceeding-hours prevention
- Auto-save retry behavior
- Auto-submit timing and cutoff logic
- Reminder eligibility
- Edit-request lifecycle and expiry
- RBAC enforcement
- Session timeout behavior

## Manual UAT
1. Sign in as a seeded or Azure-mapped program head.
2. Open current month timesheet and verify add/edit/remove entry behavior.
3. Change hours or leave count and confirm auto-save state changes from `Saving...` to `Saved`.
4. Refresh the page after editing and verify the draft persists.
5. Submit a timesheet with missing descriptions and confirm hard-stop errors.
6. Submit a fully complete timesheet and confirm confirmation page and email log entry.
7. Open a previous-month frozen/submitted sheet and request edit with a reason.
8. Sign in as admin, approve the edit request, and confirm the user can edit again.
9. Let or simulate the 3-working-day expiry and confirm auto-freeze without auto-resubmission.
10. Trigger report exports and verify CSV/PDF downloads.

## Deployment Notes
- The requirements did not specify a hosting provider.
- This repo is built for one managed Node-compatible deployment target.
- Recommended MVP deployment flow:
  1. Provision PostgreSQL
  2. Set environment variables
  3. Run `npm ci`
  4. Run `npm run db:deploy`
  5. Run `npm run build`
  6. Start with `npm run start`
- Enable `ENABLE_SCHEDULER=true` on exactly one application instance.

## Monitoring And Backup Notes
- Health check: `/api/health`
- Structured console logging is implemented in [lib/logger.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/logger.ts)
- Optional webhook-based observability hook exists in [lib/observability.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/observability.ts)
- Database backup policy from the requirements should be implemented at the managed Postgres layer:
  - daily automated backups
  - point-in-time recovery with 7-day retention
  - weekly full backups retained for 3 months

## Troubleshooting
- Local login card is missing on `/login`:
  Confirm `LOCAL_AUTH_ENABLED=true` in `.env.local` and restart `npm run dev`.
- Local database connection fails:
  Re-run `npm run db:local:start`, then `npm run db:local:status` to confirm the Prisma local database is running.
- Login denied immediately after Microsoft SSO:
  Check Azure group mapping env vars or ensure the user already exists with a seeded/internal role.
- Emails logged as failed:
  Verify SMTP variables. The app logs placeholder email content even if SMTP is missing.
- Scheduler not running:
  Ensure `ENABLE_SCHEDULER=true` on one instance only.
- Build warning about Prisma config deprecation:
  Current implementation uses Prisma 6 seed configuration. This is documented in developer notes and does not block the MVP.

## Failure Scenarios
- Auto-save API failure:
  The UI retries 3 times, stores a browser backup, and shows a toast.
- Incomplete previous-month timesheet on the 5th:
  The sheet freezes and requires an edit request.
- Edit request rejected:
  The sheet remains locked and a fresh request can be created later.
- Edit window expires without resubmission:
  The sheet auto-freezes again and stays locked.
- SMTP unavailable:
  Email logs record failure and the business transaction still completes.

## Security Considerations
- Microsoft SSO only
- JWT-backed Auth.js sessions
- Inactivity timeout enforced in application session logic
- RBAC checks on pages and API routes
- Same-origin checks on state-changing API requests
- Prisma prevents SQL injection through parameterization
- React escaping avoids XSS-prone rendering patterns
- Audit logs capture critical workflow events

## Pending External Inputs / TODOs
See [TODO_EXTERNAL_INPUTS.md](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/TODO_EXTERNAL_INPUTS.md).

## Accepted Working Clarifications Used During Implementation
- Clarifications summary overrides earlier contradictory wording
- Only the previous month can be reopened through edit approval
- Description is optional in draft save but mandatory at submission
- `EDIT_APPROVED` stays distinct from `DRAFT`
- Edit approval opens 3 working days and expires back to `FROZEN`
- No auto-resubmission when the edit window expires
- `/api/v1` prefix is used consistently
- Lean but meaningful automated tests are implemented for critical rules

## Known Limitations Grounded In The Source
- Final stakeholder email copy and subject lines are placeholders until provided
- Employee master source, manager hierarchy source, and project list update mechanism are still external pending inputs
- Project/activity is not modeled as a separate field because the source-defined timesheet fields only specify sub-program and description
- Detailed row-level edit history is intentionally not captured because the requirements explicitly say not to maintain it
- The 3-working-day window is implemented as the next three working days after approval; this is documented as an implementation assumption pending business confirmation
