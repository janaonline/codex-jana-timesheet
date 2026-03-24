import { AUTH_MODES, type AuthMode } from "@/lib/constants";
import { safeJsonParse } from "@/lib/utils";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/directors_timesheet";

function getEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function getBoolean(name: string, fallback = false) {
  return (process.env[name] ?? String(fallback)).toLowerCase() === "true";
}

function getNumber(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getAuthMode(name: string, fallback: AuthMode) {
  const value = process.env[name];
  return AUTH_MODES.includes(value as AuthMode) ? (value as AuthMode) : fallback;
}

export const env = {
  nodeEnv: getEnv("NODE_ENV", "development"),
  databaseUrl: getEnv("DATABASE_URL", DEFAULT_DATABASE_URL),
  nextAuthUrl: getEnv("NEXTAUTH_URL", "http://localhost:3000"),
  nextAuthSecret: getEnv(
    "NEXTAUTH_SECRET",
    "replace-with-a-long-random-secret",
  ),
  authMode: getAuthMode("AUTH_MODE", "password"),
  azureAdClientId: getEnv("AZURE_AD_CLIENT_ID"),
  azureAdClientSecret: getEnv("AZURE_AD_CLIENT_SECRET"),
  azureAdTenantId: getEnv("AZURE_AD_TENANT_ID"),
  azureAdProgramHeadGroupId: getEnv("AZURE_AD_PROGRAM_HEAD_GROUP_ID"),
  azureAdAdminGroupId: getEnv("AZURE_AD_ADMIN_GROUP_ID"),
  azureAdOperationsGroupId: getEnv("AZURE_AD_OPERATIONS_GROUP_ID"),
  smtpHost: getEnv("SMTP_HOST"),
  smtpPort: getNumber("SMTP_PORT", 587),
  smtpUser: getEnv("SMTP_USER"),
  smtpPassword: getEnv("SMTP_PASSWORD"),
  smtpFromEmail: getEnv("SMTP_FROM_EMAIL", "timesheets@janaagraha.org"),
  smtpFromName: getEnv("SMTP_FROM_NAME", "Janaagraha Timesheets"),
  appBaseUrl: getEnv("APP_BASE_URL", "http://localhost:3000"),
  cronJobSharedSecret: getEnv("CRON_JOB_SHARED_SECRET", "dev-job-secret"),
  enableScheduler: getBoolean("ENABLE_SCHEDULER", false),
  supportContactEmail: getEnv(
    "SUPPORT_CONTACT_EMAIL",
    "support@janaagraha.org",
  ),
  holidayCalendar: safeJsonParse<string[]>(
    getEnv("HOLIDAY_CALENDAR_JSON", "[]"),
    [],
  ),
  observabilityWebhookUrl: getEnv("OBSERVABILITY_WEBHOOK_URL"),
};

export function hasAzureSsoConfig() {
  return Boolean(
    env.azureAdClientId && env.azureAdClientSecret && env.azureAdTenantId,
  );
}

export function isPasswordAuthEnabled() {
  return env.authMode === "password";
}

export function isAzureSsoEnabled() {
  return env.authMode === "azuread" && hasAzureSsoConfig();
}

export function hasSmtpConfig() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPassword);
}
