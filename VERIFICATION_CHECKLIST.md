# Verification Checklist Against Requirements

## Core Scope
- [x] One Next.js app with built-in API routes
- [x] TypeScript throughout
- [x] Tailwind CSS only
- [x] PostgreSQL + Prisma schema and migration
- [x] Auth.js with Microsoft Azure AD provider
- [x] node-cron daily scheduler
- [x] Nodemailer email flow

## Timesheet Rules
- [x] Monthly timesheet with daily breakdown
- [x] Current and previous month support
- [x] Historical months view-only
- [x] Hours in `0.25` increments only
- [x] Daily total max `24`
- [x] Leave deduction from assigned hours
- [x] Exact 100% completion logic
- [x] No rounding in eligibility logic
- [x] Prevent total recorded hours exceeding assigned hours
- [x] Description optional in draft, mandatory in submission
- [x] Hard-stop validation only

## Auto-Save
- [x] Debounced auto-save
- [x] Manual Save Draft
- [x] Retry with 3 attempts and exponential backoff
- [x] Local browser fallback
- [x] Save status indicator
- [x] Unsaved-change unload protection

## Auto-Submit / Freeze
- [x] Scheduler runs daily at `12:00 AM IST`
- [x] Auto-submit only on the exact 5th cutoff window
- [x] Only previous-month draft sheets are evaluated
- [x] Only exact 100% drafts auto-submit
- [x] Incomplete previous-month drafts become frozen
- [x] No grace period

## Edit Request Workflow
- [x] Request Edit visible for previous-month locked states
- [x] Reason required and capped at 500 characters
- [x] `EDIT_REQUESTED`, `EDIT_APPROVED`, `REJECTED`, `RESUBMITTED` all modeled
- [x] Approver can approve/reject only
- [x] Approved sheets reopen for 3 working days
- [x] Expired windows re-freeze
- [x] No auto-resubmit on expiry

## Dashboards And Reports
- [x] Program head dashboard
- [x] Admin dashboard
- [x] Pending edit request screen
- [x] Compliance report
- [x] Hours utilization report
- [x] Edit request report
- [x] PDF export
- [x] Excel/CSV export

## Observability / Security / Reliability
- [x] Audit logs
- [x] Email logs
- [x] Health check
- [x] Structured logging
- [x] Same-origin checks on mutating APIs
- [x] RBAC on pages and APIs
- [x] Session inactivity enforcement

## Documentation
- [x] README
- [x] Developer notes
- [x] Operations notes
- [x] Pending external inputs / TODOs
- [x] Automated critical-rule tests
