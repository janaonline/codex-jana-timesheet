import nodemailer from "nodemailer";

import {
  buildEditDecisionEmail,
  buildEditRequestAlertEmail,
  buildFinalNoticeEmail,
  buildReminderEmail,
  buildSubmissionConfirmationEmail,
} from "@/emails/templates";
import { EMAIL_RETRY_DELAYS_MS, type ReminderKind } from "@/lib/constants";
import { env, hasSmtpConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";
import { prisma } from "@/lib/prisma";
import { sleep } from "@/lib/utils";

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
          "SMTP configuration is missing. Placeholder email logged but not sent.",
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
  const { subject, html } = buildReminderEmail(params);
  return sendEmailWithRetry({
    category: params.kind,
    recipient: params.recipient,
    subject,
    html,
    userId: params.userId,
    timesheetId: params.timesheetId,
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
  const { subject, html } = buildFinalNoticeEmail(params);
  return sendEmailWithRetry({
    category: "FINAL_NOTICE_5TH",
    recipient: params.recipient,
    subject,
    html,
    userId: params.userId,
    timesheetId: params.timesheetId,
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
  const { subject, html } = buildSubmissionConfirmationEmail(params);
  return sendEmailWithRetry({
    category: "SUBMISSION_CONFIRMATION",
    recipient: params.recipient,
    subject,
    html,
    userId: params.userId,
    timesheetId: params.timesheetId,
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
  const { subject, html } = buildEditRequestAlertEmail(params);
  return sendEmailWithRetry({
    category: "EDIT_REQUEST_ALERT",
    recipient: params.recipient,
    subject,
    html,
    userId: params.requesterUserId,
    timesheetId: params.timesheetId,
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
  const { subject, html } = buildEditDecisionEmail(params);
  return sendEmailWithRetry({
    category: params.approved ? "EDIT_APPROVED" : "EDIT_REJECTED",
    recipient: params.recipient,
    subject,
    html,
    userId: params.userId,
    timesheetId: params.timesheetId,
  });
}

export async function sendAdminAutoSubmitNoticeMessage(params: {
  recipient: string;
  monthLabel: string;
  programHeadName: string;
  totalHoursRecorded: number;
  timesheetId: string;
}) {
  const subject = `[MVP placeholder] ${params.monthLabel} timesheet auto-submitted for ${params.programHeadName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 24px;">
      <h1 style="font-size: 22px; margin-bottom: 16px;">Auto-submit notification</h1>
      <p>This is a placeholder admin notification template until final stakeholder email content is supplied.</p>
      <ul>
        <li>Program head: ${params.programHeadName}</li>
        <li>Month: ${params.monthLabel}</li>
        <li>Total hours recorded: ${params.totalHoursRecorded}</li>
      </ul>
    </div>
  `;

  return sendEmailWithRetry({
    category: "ADMIN_AUTO_SUBMIT_NOTICE",
    recipient: params.recipient,
    subject,
    html,
    timesheetId: params.timesheetId,
  });
}
