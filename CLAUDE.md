# CLAUDE.md — Codex Jana Timesheet

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript 5
- **Database:** PostgreSQL via Prisma ORM 6
- **Auth:** NextAuth v4 (JWT strategy) — default: password + OTP; optional: Azure AD (`AUTH_MODE=azuread`)
- **Styling:** Tailwind CSS 4, PostCSS
- **Email:** Nodemailer
- **Scheduling:** node-cron (runs in `instrumentation.ts` when `ENABLE_SCHEDULER=true`)
- **PDF/Export:** PDFKit
- **Date handling:** date-fns + date-fns-tz (IST timezone throughout)
- **Testing:** Vitest + jsdom

## Local Development

```bash
npm run dev          # Start dev server
npm run build        # prisma generate && next build
npm start            # Production server
npm test             # Run unit tests (Vitest)
npm run test:watch   # Watch mode
npm run smoke        # lint + test

# Database helpers
npm run db:local     # Start local DB
npm run db:migrate   # Apply migrations
npm run db:seed      # Seed data
npm run db:generate  # Regenerate Prisma client
Key env vars: DATABASE_URL, NEXTAUTH_SECRET, APP_BASE_URL, ENABLE_SCHEDULER, AUTH_MODE

Pages
User-facing
Route	Description
/	Root / landing
/login	Login screen
/auth/set-password	Password setup after OTP
/dashboard	Main user dashboard
/timesheets/[id]	Timesheet editor
/timesheets/[id]/confirmation	Submission confirmation
/timesheets/month/[monthKey]	Monthly timesheet view
/forbidden	Access denied
Admin
Route	Description
/admin	Config and oversight
/admin/edit-requests	Edit request management
/admin/reports	Reporting and analytics
Architecture
Layer pattern: app/api/ route handlers → services/ (business logic) → Prisma (data)

API routes live under /api/v1/ with a standardised response wrapper (lib/api-route.ts)
In-memory rate limiting in lib/rate-limit.ts
RBAC matrix in lib/rbac.ts; roles: PROGRAM_HEAD, ASSOCIATE_DIRECTOR, ADMIN, OPERATIONS
Background jobs: auto-submit and freeze run at 0 0 * * * Asia/Kolkata; triggered from instrumentation.ts
Job endpoints accept JWT session or x-job-secret header
Business rules to know:

Time resolution: 10-minute increments
Submission requires totalMinutes === assignedMinutes exactly
Three allocation modes: day (source of truth), week, month
Calendar states: NONE, HALF_DAY, FULL_DAY, manual holiday
Testing
Unit tests are in tests/unit/. Run with npm test. Coverage with npm run test:coverage.

Tests cover: auth flows, RBAC, autosave, timesheet calculations, edit-request lifecycle, reports, workflow rules.

Key Files
File	Purpose
lib/rbac.ts	Role-based access control
lib/timesheet-allocation-forms.ts	Allocation business logic
services/timesheet-service.ts	Core workflow orchestration
services/scheduler-service.ts	Cron job management
lib/autosave.ts	Draft persistence logic
prisma/schema.prisma	Database schema
instrumentation.ts	Scheduler entry point (Next.js hook)


---

Paste this into your CLAUDE.md. The three requested sections (tech stack, pages, start command) are all included, plus architecture context that will help in future Claude sessions.