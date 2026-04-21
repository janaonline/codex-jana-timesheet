import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_REMINDER_SCHEDULE,
  DEFAULT_ROLE_ACCESS,
  type Permission,
  type UserRole,
} from "@/lib/constants";
import { env } from "@/lib/env";
import {
  DEFAULT_EMAIL_TEMPLATE_CONTENT,
  type EmailTemplateContent,
  type EmailTemplateKey,
} from "@/emails/templates";
import { normalizeRoleAccess, type RoleAccessMatrix } from "@/lib/rbac";
import { safeJsonParse } from "@/lib/utils";

export type ReminderConfiguration = {
  currentMonthDraftDays: number[];
  currentMonthSubmitDay: "last-day";
  nextMonthPendingDays: number[];
};

export type EmailTemplateConfiguration = Record<
  EmailTemplateKey,
  EmailTemplateContent
>;

export type SystemConfigurationView = {
  id: string;
  reminderDays: ReminderConfiguration;
  autoSubmitDay: number;
  completionThreshold: number;
  inactivityTimeoutMins: number;
  holidayCalendar: string[];
  roleAccess: RoleAccessMatrix;
  emailTemplates: EmailTemplateConfiguration;
  notifyAdminOnAutoSubmit: boolean;
  supportContactEmail: string;
};

export type SystemConfigurationUpdateInput = Partial<
  Omit<SystemConfigurationView, "emailTemplates">
>;

const DEFAULT_CONFIGURATION: SystemConfigurationView = {
  id: "default",
  reminderDays: {
    currentMonthDraftDays: [...DEFAULT_REMINDER_SCHEDULE.currentMonthDraftDays],
    currentMonthSubmitDay: DEFAULT_REMINDER_SCHEDULE.currentMonthSubmitDay,
    nextMonthPendingDays: [...DEFAULT_REMINDER_SCHEDULE.nextMonthPendingDays],
  },
  autoSubmitDay: 5,
  completionThreshold: 100,
  inactivityTimeoutMins: 30,
  holidayCalendar: env.holidayCalendar,
  roleAccess: DEFAULT_ROLE_ACCESS,
  emailTemplates: DEFAULT_EMAIL_TEMPLATE_CONTENT,
  notifyAdminOnAutoSubmit: true,
  supportContactEmail: env.supportContactEmail,
};

const CONFIG_CACHE_TTL_MS = 30_000;

let cachedSystemConfiguration:
  | {
      value: SystemConfigurationView;
      expiresAt: number;
    }
  | null = null;
let inFlightSystemConfiguration: Promise<SystemConfigurationView> | null = null;

function normalizeReminderDays(raw: unknown): ReminderConfiguration {
  const fallback = DEFAULT_CONFIGURATION.reminderDays;

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const value = raw as Partial<ReminderConfiguration>;

  return {
    currentMonthDraftDays: Array.isArray(value.currentMonthDraftDays)
      ? value.currentMonthDraftDays.filter((day): day is number => Number.isInteger(day))
      : fallback.currentMonthDraftDays,
    currentMonthSubmitDay:
      value.currentMonthSubmitDay === "last-day"
        ? "last-day"
        : fallback.currentMonthSubmitDay,
    nextMonthPendingDays: Array.isArray(value.nextMonthPendingDays)
      ? value.nextMonthPendingDays.filter((day): day is number => Number.isInteger(day))
      : fallback.nextMonthPendingDays,
  };
}

function normalizeEmailTemplates(raw: unknown): EmailTemplateConfiguration {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_CONFIGURATION.emailTemplates;
  }

  const incoming = raw as Partial<EmailTemplateConfiguration>;

  return Object.fromEntries(
    Object.entries(DEFAULT_CONFIGURATION.emailTemplates).map(([key, template]) => {
      const nextTemplate = incoming[key as EmailTemplateKey];
      return [
        key,
        {
          subject: nextTemplate?.subject ?? template.subject,
          html: nextTemplate?.html ?? template.html,
          text: nextTemplate?.text ?? template.text,
        },
      ];
    }),
  ) as EmailTemplateConfiguration;
}

function toSystemConfigurationView(record: {
  id: string;
  reminderDays: unknown;
  autoSubmitDay: number;
  completionThreshold: number;
  inactivityTimeoutMins: number;
  holidayCalendar: unknown;
  roleAccess: unknown;
  emailTemplates: unknown;
  notifyAdminOnAutoSubmit: boolean;
  supportContactEmail: string;
}) {
  return {
    id: record.id,
    reminderDays: normalizeReminderDays(record.reminderDays),
    autoSubmitDay: record.autoSubmitDay,
    completionThreshold: record.completionThreshold,
    inactivityTimeoutMins: record.inactivityTimeoutMins,
    holidayCalendar: Array.isArray(record.holidayCalendar)
      ? (record.holidayCalendar as string[])
      : safeJsonParse<string[]>(JSON.stringify(record.holidayCalendar), []),
    roleAccess: normalizeRoleAccess(record.roleAccess),
    emailTemplates: normalizeEmailTemplates(record.emailTemplates),
    notifyAdminOnAutoSubmit: record.notifyAdminOnAutoSubmit,
    supportContactEmail: record.supportContactEmail,
  } satisfies SystemConfigurationView;
}

function cacheSystemConfiguration(value: SystemConfigurationView) {
  cachedSystemConfiguration = {
    value,
    expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
  };

  return value;
}

function invalidateSystemConfigurationCache() {
  cachedSystemConfiguration = null;
  inFlightSystemConfiguration = null;
}

async function createDefaultSystemConfigurationRecord() {
  try {
    return await prisma.systemConfiguration.create({
      data: {
        id: DEFAULT_CONFIGURATION.id,
        reminderDays: DEFAULT_CONFIGURATION.reminderDays,
        autoSubmitDay: DEFAULT_CONFIGURATION.autoSubmitDay,
        completionThreshold: DEFAULT_CONFIGURATION.completionThreshold,
        inactivityTimeoutMins: DEFAULT_CONFIGURATION.inactivityTimeoutMins,
        holidayCalendar: DEFAULT_CONFIGURATION.holidayCalendar,
        roleAccess: DEFAULT_CONFIGURATION.roleAccess,
        emailTemplates: DEFAULT_CONFIGURATION.emailTemplates,
        notifyAdminOnAutoSubmit: DEFAULT_CONFIGURATION.notifyAdminOnAutoSubmit,
        supportContactEmail: DEFAULT_CONFIGURATION.supportContactEmail,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.systemConfiguration.findUnique({
        where: { id: DEFAULT_CONFIGURATION.id },
      });

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

async function readSystemConfigurationRecord() {
  const existing = await prisma.systemConfiguration.findUnique({
    where: { id: DEFAULT_CONFIGURATION.id },
  });

  if (existing) {
    return existing;
  }

  return createDefaultSystemConfigurationRecord();
}

export async function getSystemConfiguration() {
  if (
    cachedSystemConfiguration &&
    cachedSystemConfiguration.expiresAt > Date.now()
  ) {
    return cachedSystemConfiguration.value;
  }

  if (inFlightSystemConfiguration) {
    return inFlightSystemConfiguration;
  }

  inFlightSystemConfiguration = (async () => {
    const record = await readSystemConfigurationRecord();
    return cacheSystemConfiguration(toSystemConfigurationView(record));
  })();

  try {
    return await inFlightSystemConfiguration;
  } finally {
    inFlightSystemConfiguration = null;
  }
}

export async function updateSystemConfiguration(input: SystemConfigurationUpdateInput) {
  const current = await getSystemConfiguration();

  const updated = await prisma.systemConfiguration.update({
    where: { id: current.id },
    data: {
      reminderDays: input.reminderDays ?? current.reminderDays,
      autoSubmitDay: input.autoSubmitDay ?? current.autoSubmitDay,
      completionThreshold: input.completionThreshold ?? current.completionThreshold,
      inactivityTimeoutMins:
        input.inactivityTimeoutMins ?? current.inactivityTimeoutMins,
      holidayCalendar: input.holidayCalendar ?? current.holidayCalendar,
      roleAccess: input.roleAccess ?? current.roleAccess,
      notifyAdminOnAutoSubmit:
        input.notifyAdminOnAutoSubmit ?? current.notifyAdminOnAutoSubmit,
      supportContactEmail: input.supportContactEmail ?? current.supportContactEmail,
    },
  });

  invalidateSystemConfigurationCache();
  return cacheSystemConfiguration(toSystemConfigurationView(updated));
}

export function serializeRoleAccessForDisplay(roleAccess: RoleAccessMatrix) {
  return Object.entries(roleAccess).map(([role, permissions]) => ({
    role: role as UserRole,
    permissions: permissions as Permission[],
  }));
}
