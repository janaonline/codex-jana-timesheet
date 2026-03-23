# Developer Notes

## Implementation Summary
This codebase was built from the Janaagraha requirements document as a single Next.js MVP. Business rules are intentionally centralized in service and helper modules rather than spread across components or API handlers.

Primary implementation anchors:
- Domain schema: [prisma/schema.prisma](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/prisma/schema.prisma)
- Business rules: [lib/timesheet-calculations.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/timesheet-calculations.ts), [lib/workflow-rules.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/workflow-rules.ts)
- Core workflows: [services/timesheet-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/timesheet-service.ts)
- Daily jobs: [services/job-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/job-service.ts)
- Reports/exports: [services/report-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/report-service.ts), [services/export-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/export-service.ts)

## Folder Responsibilities
- `app/`: pages, layouts, route handlers, server actions
- `components/`: plain Tailwind components
- `hooks/`: client-only autosave behavior
- `lib/`: shared helpers, auth, validation, rate limiting, time logic
- `services/`: domain workflows and integrations
- `prisma/`: schema, migration, seed
- `tests/unit/`: focused automated business-rule tests

## Key Design Decisions
- No extra backend service was introduced.
- No queue or Redis dependency was added.
- JWT sessions were used instead of Prisma auth adapter tables so the database stays aligned with the required core domain tables.
- Admin configuration is handled with a minimal persisted `SystemConfiguration` table plus server-action forms instead of inventing additional public config APIs.
- Export support uses PDF + CSV. CSV is the Excel-compatible path for the MVP.

## Business Logic Placement
- Working-day, cutoff, reminder, and edit-window rules are pure helpers in `lib/`.
- Persistence and state transitions live in `services/`.
- Route handlers only parse input, enforce auth/origin/rate limit, and call services.
- UI uses SSR by default and client islands only where interaction is necessary.

## Critical Assumptions
- The 3-working-day edit window is counted as the next three working days after approval.
- Program/activity reporting is represented through sub-program totals plus description text rather than a separate activity field.
- New users without mapped Azure groups are denied unless they already exist in the internal `User` table with a role.

## Developer Workflow
```bash
npm install
npm run db:local:start
npm run db:deploy
npm run db:seed
npm run dev
```

Local workflow details:
- The checked-in local setup uses Prisma's local dev database server under the name `directors-timesheet`.
- `.env.local` is used by Next.js during app runtime.
- `.env` is present so Prisma CLI commands can resolve `DATABASE_URL`.
- `LOCAL_AUTH_ENABLED=true` exposes a development-only seeded-account sign-in path on `/login`.
- Production behavior is unchanged: Microsoft Entra ID / Azure AD remains the supported authentication path outside local development.

## Verification Performed In This Workspace
- `npm run lint`
- `npm test`
- `npm run build`

## Known Developer Caveats
- Prisma 6 currently emits a deprecation warning for `package.json#prisma.seed`; this does not block the app and avoids the Prisma 7 config churn that was not needed for the MVP.
- Prisma `generate` can hit a Windows file lock if the Prisma local dev database daemon is actively holding the query engine. In this workspace the app runs correctly with the existing generated client after migrations and seeding, so this does not block local development.
- SMTP is optional for local dev, but email logs will show failures until credentials are configured.
- Scheduler should run on one instance only in deployed environments.

## Manual UAT Checklist
### Program Head
1. Sign in through Azure AD or use `anita.director@janaagraha.org` from the local development sign-in card and open the dashboard.
2. Edit current month entries and confirm auto-save status updates.
3. Refresh the page and confirm draft recovery.
4. Attempt submission with blank descriptions and confirm hard-stop validation.
5. Submit a fully complete timesheet and confirm confirmation view.
6. Open previous month and request edit on a frozen/submitted sheet.

### Admin / Operations
1. Use `girija.admin@janaagraha.org` or `mira.operations@janaagraha.org`, then open the admin dashboard and confirm compliance metrics render.
2. Open pending edit requests and approve one request.
3. Re-open reports page and download CSV and PDF exports.
4. Update system configuration and approver mapping from the admin dashboard.

### Scheduler / Workflow
1. Trigger `/api/v1/jobs/send-reminders` with admin session or shared secret on a reminder date.
2. Trigger `/api/v1/jobs/auto-submit` only at the exact 5th `12:00 AM IST` window for acceptance behavior.
3. Simulate an expired `EDIT_APPROVED` record and confirm re-freeze.
