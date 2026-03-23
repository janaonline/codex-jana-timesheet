"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { updateSystemConfiguration } from "@/services/configuration-service";

function parseNumberList(input: string) {
  return input
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

export async function updateConfigurationAction(formData: FormData) {
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
    emailTemplates: JSON.parse(String(formData.get("emailTemplates") ?? "{}")),
    roleAccess: JSON.parse(String(formData.get("roleAccess") ?? "{}")),
  });

  revalidatePath("/admin");
}

export async function updateApproverMappingsAction(formData: FormData) {
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
