export const IST_TIMEZONE = "Asia/Kolkata";
export const APP_NAME = "Directors Timesheet Management System";
export const ORGANIZATION_NAME = "Janaagraha";
export const API_VERSION_PREFIX = "/api/v1";
export const LOCAL_AUTH_PROVIDER_ID = "credentials";
export const DEFAULT_RATE_LIMIT = 100;
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
export const AUTOSAVE_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
export const EMAIL_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
export const REQUEST_EDIT_REASON_LIMIT = 500;
export const DEFAULT_REMINDER_SCHEDULE = {
  currentMonthDraftDays: [25, 28],
  currentMonthSubmitDay: "last-day",
  nextMonthPendingDays: [3, 5],
} as const;

export const USER_ROLES = ["PROGRAM_HEAD", "ADMIN", "OPERATIONS"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const TIMESHEET_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "AUTO_SUBMITTED",
  "FROZEN",
  "EDIT_REQUESTED",
  "EDIT_APPROVED",
  "REJECTED",
  "RESUBMITTED",
] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export const EDIT_REQUEST_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;
export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number];

export const EMAIL_LOG_STATUSES = ["PENDING", "SENT", "FAILED"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

export const REMINDER_KINDS = [
  "REMINDER_25TH",
  "REMINDER_28TH",
  "REMINDER_LAST_DAY",
  "REMINDER_3RD",
  "FINAL_NOTICE_5TH",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type Permission =
  | "timesheets:read:self"
  | "timesheets:write:self"
  | "timesheets:submit:self"
  | "timesheets:request-edit:self"
  | "reports:read:admin"
  | "reports:export:admin"
  | "edit-requests:review"
  | "jobs:run"
  | "configuration:manage";

export const DEFAULT_ROLE_ACCESS: Record<UserRole, Permission[]> = {
  PROGRAM_HEAD: [
    "timesheets:read:self",
    "timesheets:write:self",
    "timesheets:submit:self",
    "timesheets:request-edit:self",
  ],
  ADMIN: [
    "timesheets:read:self",
    "reports:read:admin",
    "reports:export:admin",
    "edit-requests:review",
    "jobs:run",
    "configuration:manage",
  ],
  OPERATIONS: [
    "timesheets:read:self",
    "reports:read:admin",
    "reports:export:admin",
    "jobs:run",
  ],
};
