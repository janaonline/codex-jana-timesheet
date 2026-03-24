import type { AuthOtpPurpose } from "@prisma/client";
import nodemailer from "nodemailer";

import {
  EMAIL_RETRY_DELAYS_MS,
  APP_NAME,
  type ReminderKind,
} from "@/lib/constants";
import { env, hasSmtpConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { formatDisplayDate } from "@/lib/time";
import { sleep } from "@/lib/utils";
import {
  renderEmailTemplate,
  type EmailTemplateKey,
} from "@/emails/templates";
import { getSystemConfiguration } from "@/services/configuration-service";

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!hasSmtpConfig()) {
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPassword,
      },
    });
  }

  return cachedTransporter;
}

async function sendEmailWithRetry(params: {
  category: string;
  recipient: string;
  subject: string;
  html: string;
  text: string;
  userId?: string;
  timesheetId?: string;
}) {
  const emailLog = await prisma.emailLog.create({
    data: {
      category: params.category,
      recipient: params.recipient,
      subject: params.subject,
      htmlPreview: params.html,
      userId: params.userId,
      timesheetId: params.timesheetId,
      status: "PENDING",
    },
  });

  const transporter = getTransporter();

  if (!transporter) {
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: "FAILED",
        errorMessage:
          "SMTP configuration is missing. Email content was logged but not sent.",
        attempts: 1,
      },
    });

    logger.warn("Email not sent because SMTP is not configured", {
      category: params.category,
      recipient: params.recipient,
    });

    return null;
  }

  for (let index = 0; index < EMAIL_RETRY_DELAYS_MS.length; index += 1) {
    const attempt = index + 1;

    try {
      const result = await transporter.sendMail({
        from: `"${env.smtpFromName}" <${env.smtpFromEmail}>`,
        to: params.recipient,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });

      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: "SENT",
          attempts: attempt,
          providerMessageId: result.messageId,
          sentAt: new Date(),
        },
      });

      return result;
    } catch (error) {
      await prisma.emailLog.update({
        where: { id: emailLog.id },
        data: {
          status: attempt === EMAIL_RETRY_DELAYS_MS.length ? "FAILED" : "PENDING",
          attempts: attempt,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });

      if (attempt === EMAIL_RETRY_DELAYS_MS.length) {
        await captureError("email_send_failed", error, {
          category: params.category,
          recipient: params.recipient,
        });
        return null;
      }

      await sleep(EMAIL_RETRY_DELAYS_MS[index]);
    }
  }

  return null;
}

async function sendTemplateEmail(params: {
  category: string;
  templateKey: EmailTemplateKey;
  recipient: string;
  tokens: Record<string, unknown>;
  userId?: string;
  timesheetId?: string;
}) {
  const config = await getSystemConfiguration();
  const rendered = renderEmailTemplate(
    params.templateKey,
    {
      supportContactEmail: config.supportContactEmail,
      appName: APP_NAME,
      ...params.tokens,
    },
    config.emailTemplates,
  );

  return sendEmailWithRetry({
    category: params.category,
    recipient: params.recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    userId: params.userId,
    timesheetId: params.timesheetId,
  });
}

function reminderTemplateKey(kind: ReminderKind): Extract<
  EmailTemplateKey,
  "REMINDER_25TH" | "REMINDER_28TH" | "REMINDER_LAST_DAY" | "REMINDER_3RD"
> {
  if (kind === "REMINDER_25TH") {
    return "REMINDER_25TH";
  }

  if (kind === "REMINDER_28TH") {
    return "REMINDER_28TH";
  }

  if (kind === "REMINDER_LAST_DAY") {
    return "REMINDER_LAST_DAY";
  }

  return "REMINDER_3RD";
}

function otpTemplateKey(purpose: AuthOtpPurpose): Extract<
  EmailTemplateKey,
  "AUTH_OTP_FIRST_LOGIN" | "AUTH_OTP_FORGOT_PASSWORD" | "AUTH_OTP_ACCOUNT_ACTIVATION"
> {
  if (purpose === "FORGOT_PASSWORD") {
    return "AUTH_OTP_FORGOT_PASSWORD";
  }

  if (purpose === "ACCOUNT_ACTIVATION") {
    return "AUTH_OTP_ACCOUNT_ACTIVATION";
  }

  return "AUTH_OTP_FIRST_LOGIN";
}

export async function sendOtpMessage(params: {
  purpose: AuthOtpPurpose;
  recipient: string;
  userName: string;
  userId: string;
  otpCode: string;
  expiresInMinutes: number;
}) {
  return sendTemplateEmail({
    category: `AUTH_OTP_${params.purpose}`,
    templateKey: otpTemplateKey(params.purpose),
    recipient: params.recipient,
    userId: params.userId,
    tokens: {
      userName: params.userName,
      otpCode: params.otpCode,
      expiresInMinutes: params.expiresInMinutes,
      supportContactEmail: env.supportContactEmail,
      appName: APP_NAME,
    },
  });
}

export async function sendReminderMessage(params: {
  kind: ReminderKind;
  recipient: string;
  userName: string;
  userId: string;
  timesheetId: string;
  monthLabel: string;
  completionPercentage: number;
  remainingHours: number;
  daysRemaining: number;
  deadlineDate: string;
  autoSubmitDate: string;
  submitUrl?: string;
  requestEditUrl?: string;
  supportContactEmail: string;
}) {
  return sendTemplateEmail({
    category: params.kind,
    templateKey: reminderTemplateKey(params.kind),
    recipient: params.recipient,
    userId: params.userId,
    timesheetId: params.timesheetId,
    tokens: {
      userName: params.userName,
      monthLabel: params.monthLabel,
      completionPercentage: params.completionPercentage,
      remainingHours: params.remainingHours,
      daysRemaining: params.daysRemaining,
      deadlineDate: formatDisplayDate(params.deadlineDate),
      autoSubmitDate: formatDisplayDate(params.autoSubmitDate),
      submitUrl: params.submitUrl,
      requestEditUrl: params.requestEditUrl,
      supportContactEmail: params.supportContactEmail,
    },
  });
}

export async function sendFinalNoticeMessage(params: {
  recipient: string;
  userName: string;
  userId: string;
  timesheetId: string;
  monthLabel: string;
  completionPercentage: number;
  remainingHours: number;
  autoSubmitted: boolean;
  requestEditUrl?: string;
  supportContactEmail: string;
}) {
  return sendTemplateEmail({
    category: "FINAL_NOTICE_5TH",
    templateKey: params.autoSubmitted
      ? "FINAL_NOTICE_SUCCESS"
      : "FINAL_NOTICE_FAILURE",
    recipient: params.recipient,
    userId: params.userId,
    timesheetId: params.timesheetId,
    tokens: {
      userName: params.userName,
      monthLabel: params.monthLabel,
      completionPercentage: params.completionPercentage,
      remainingHours: params.remainingHours,
      requestEditUrl: params.requestEditUrl,
      supportContactEmail: params.supportContactEmail,
    },
  });
}

export async function sendSubmissionConfirmationMessage(params: {
  recipient: string;
  userName: string;
  userId: string;
  timesheetId: string;
  monthLabel: string;
  submissionTimestamp: string;
  submissionMethod: "manual" | "auto";
  totalHoursRecorded: number;
  breakdownHtml: string;
  requestEditUrl?: string;
}) {
  return sendTemplateEmail({
    category: "SUBMISSION_CONFIRMATION",
    templateKey: "SUBMISSION_CONFIRMATION",
    recipient: params.recipient,
    userId: params.userId,
    timesheetId: params.timesheetId,
    tokens: {
      userName: params.userName,
      monthLabel: params.monthLabel,
      submissionTimestamp: params.submissionTimestamp,
      submissionMethod:
        params.submissionMethod === "auto" ? "Auto submit" : "Manual submit",
      totalHoursRecorded: params.totalHoursRecorded,
      breakdownHtml: params.breakdownHtml,
      requestEditUrl: params.requestEditUrl,
    },
  });
}

export async function sendEditRequestAlertMessage(params: {
  recipient: string;
  approverName: string;
  requesterName: string;
  requesterUserId: string;
  timesheetId: string;
  monthLabel: string;
  reason: string;
  reviewUrl: string;
  timesheetUrl: string;
}) {
  return sendTemplateEmail({
    category: "EDIT_REQUEST_ALERT",
    templateKey: "EDIT_REQUEST_ALERT",
    recipient: params.recipient,
    userId: params.requesterUserId,
    timesheetId: params.timesheetId,
    tokens: {
      approverName: params.approverName,
      userName: params.requesterName,
      monthLabel: params.monthLabel,
      reason: params.reason,
      reviewUrl: params.reviewUrl,
      timesheetUrl: params.timesheetUrl,
    },
  });
}

export async function sendEditDecisionMessage(params: {
  recipient: string;
  userName: string;
  userId: string;
  timesheetId: string;
  monthLabel: string;
  approved: boolean;
  editableUntil?: Date | null;
  rejectionReason?: string | null;
  timesheetUrl: string;
}) {
  return sendTemplateEmail({
    category: params.approved ? "EDIT_APPROVED" : "EDIT_REJECTED",
    templateKey: params.approved ? "EDIT_APPROVED" : "EDIT_REJECTED",
    recipient: params.recipient,
    userId: params.userId,
    timesheetId: params.timesheetId,
    tokens: {
      userName: params.userName,
      monthLabel: params.monthLabel,
      editableUntil: params.editableUntil
        ? formatDisplayDate(params.editableUntil)
        : "",
      rejectionReason: params.rejectionReason ?? "",
      timesheetUrl: params.timesheetUrl,
    },
  });
}

export async function sendAdminAutoSubmitNoticeMessage(params: {
  recipient: string;
  monthLabel: string;
  programHeadName: string;
  totalHoursRecorded: number;
  timesheetId: string;
}) {
  return sendTemplateEmail({
    category: "ADMIN_AUTO_SUBMIT_NOTICE",
    templateKey: "ADMIN_AUTO_SUBMIT_NOTICE",
    recipient: params.recipient,
    timesheetId: params.timesheetId,
    tokens: {
      userName: "Admin reviewer",
      monthLabel: params.monthLabel,
      programHeadName: params.programHeadName,
      totalHoursRecorded: params.totalHoursRecorded,
    },
  });
}
