"use server";

import { revalidatePath } from "next/cache";

import { requireApiSession } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  type EmailTemplateConfiguration,
  updateSystemConfiguration,
} from "@/services/configuration-service";
import type { RoleAccessMatrix } from "@/lib/rbac";

function parseNumberList(input: string) {
  return input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

function parseJsonField<T>(input: FormDataEntryValue | null, fieldName: string, fallback: T) {
  const raw = String(input ?? "").trim();

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AppError("INVALID_JSON", 400, `${fieldName} must be valid JSON.`);
  }
}

export async function updateConfigurationAction(formData: FormData) {
  await requireApiSession({
    permission: "configuration:manage",
  });

  const currentMonthDraftDays = parseNumberList(
    String(formData.get("currentMonthDraftDays") ?? ""),
  );
  const nextMonthPendingDays = parseNumberList(
    String(formData.get("nextMonthPendingDays") ?? ""),
  );
  const holidayCalendar = String(formData.get("holidayCalendar") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  await updateSystemConfiguration({
    reminderDays: {
      currentMonthDraftDays,
      currentMonthSubmitDay: "last-day",
      nextMonthPendingDays,
    },
    autoSubmitDay: Number(formData.get("autoSubmitDay")),
    completionThreshold: Number(formData.get("completionThreshold")),
    inactivityTimeoutMins: Number(formData.get("inactivityTimeoutMins")),
    supportContactEmail: String(formData.get("supportContactEmail") ?? ""),
    notifyAdminOnAutoSubmit: formData.get("notifyAdminOnAutoSubmit") === "on",
    holidayCalendar,
    emailTemplates: parseJsonField<EmailTemplateConfiguration | undefined>(
      formData.get("emailTemplates"),
      "emailTemplates",
      undefined,
    ),
    roleAccess: parseJsonField<RoleAccessMatrix | undefined>(
      formData.get("roleAccess"),
      "roleAccess",
      undefined,
    ),
  });

  revalidatePath("/admin");
}

export async function updateApproverMappingsAction(formData: FormData) {
  await requireApiSession({
    permission: "configuration:manage",
  });

  const users = await prisma.user.findMany({
    where: {
      role: "PROGRAM_HEAD",
      isActive: true,
    },
    select: { id: true },
  });

  for (const user of users) {
    const approverUserId = String(formData.get(`approver-${user.id}`) ?? "");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        approverUserId: approverUserId || null,
      },
    });
  }

  revalidatePath("/admin");
}
