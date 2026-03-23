# Operations Notes

## Runtime Model
- One managed Node deployment target
- One PostgreSQL database
- One app instance with `ENABLE_SCHEDULER=true`
- Additional instances, if any, should keep `ENABLE_SCHEDULER=false`

## Environment Setup
Required environment variables are documented in [`.env.example`](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/.env.example).

Minimum production set:
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- Azure AD credentials and group IDs
- SMTP credentials
- `APP_BASE_URL`
- `CRON_JOB_SHARED_SECRET`
- `ENABLE_SCHEDULER`
- `SUPPORT_CONTACT_EMAIL`

## Local Support Runbook
This workspace also has a local-only support path for developer verification:
- Start the Prisma local database with `npm run db:local:start`
- Confirm it with `npm run db:local:status`
- Apply schema with `npm run db:deploy`
- Load sample data with `npm run db:seed`
- Keep `LOCAL_AUTH_ENABLED=true` only in local `.env.local`

This local sign-in path is a development bootstrap only. It is not the production authentication model and must stay disabled outside local/UAT use.

## Deployment Runbook
1. Provision PostgreSQL with TLS and encrypted storage.
2. Apply environment variables.
3. Run `npm ci`.
4. Run `npm run db:deploy`.
5. Run `npm run build`.
6. Start the app with `npm run start`.
7. Confirm `/api/health` returns healthy.
8. Validate one authenticated sign-in and one admin page load.

## Smoke Checks
- `/login` loads
- `/api/health` returns `ok: true`
- Azure sign-in redirects successfully
- Local development sign-in renders only when `LOCAL_AUTH_ENABLED=true`
- Program head dashboard loads
- Admin dashboard loads
- `POST /api/v1/auth/session` equivalent session check returns authenticated user
- PDF/CSV export completes

## Scheduler Operations
- Scheduler entry point: [services/scheduler-service.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/services/scheduler-service.ts)
- Startup hook: [instrumentation.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/instrumentation.ts)
- Daily execution time: `12:00 AM IST`

Manual trigger options:
- `POST /api/v1/jobs/send-reminders`
- `POST /api/v1/jobs/auto-submit`

Use either:
- an admin/operations authenticated session
- or header `x-job-secret: <CRON_JOB_SHARED_SECRET>`

## Backups And Recovery
Implement these at the managed database layer:
- Daily automated backups
- Point-in-time recovery with 7-day retention
- Weekly full backups retained for 3 months
- Quarterly backup verification/testing

Target recovery expectations from the requirements:
- `RTO`: 4 hours
- `RPO`: 1 hour

## Monitoring
- Health endpoint: `/api/health`
- Structured app logs: stdout JSON events from [lib/logger.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/lib/logger.ts)
- Optional external hook: `OBSERVABILITY_WEBHOOK_URL`
- Business evidence:
  - `AuditLog` table
  - `EmailLog` table

## Maintenance Windows
The documented planned maintenance window is:
- Sundays, `2:00 AM` to `4:00 AM IST`

## Security Operations
- Keep `NEXTAUTH_SECRET` rotated and secret-managed
- Restrict admin roles to mapped Azure groups only
- Run with HTTPS/TLS 1.3 at the edge/load balancer
- Ensure Postgres connections use TLS
- Review audit logs for authentication failures and edit approvals

## Operational Failure Handling
- SMTP outage:
  Business actions still complete; email delivery failures are logged in `EmailLog`
- Scheduler failure:
  Review stdout logs and optional webhook alerts, then manually trigger the affected job route
- Database outage:
  `/api/health` fails and dynamic routes degrade; restore from managed backup procedures
- Azure group mapping issue:
  Users can be denied login even after SSO. Validate Azure group IDs and internal user role seeds

## Rollback Notes
- Application rollback: redeploy previous image/build
- Database rollback: prefer forward fix unless a controlled restore is required
- If a migration must be reversed, use standard Postgres change-control rather than destructive reset commands
