import { APP_NAME, ORGANIZATION_NAME } from "@/lib/constants";
import { env } from "@/lib/env";

const DEFAULT_SAMPLE_BASE_URL = "http://localhost:3000";

type TemplateDefinition = {
  label: string;
  description: string;
  sampleTokens: Record<string, string>;
};

export type EmailTemplateContent = {
  subject: string;
  html: string;
  text: string;
};

function buildHtmlShell(title: string, body: string) {
  return `
    <div style="margin:0;padding:32px;background:#f5f5f5;font-family:Arial,sans-serif;color:#111111;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:20px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #ededed;background:#fff8d6;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5f5500;">${ORGANIZATION_NAME}</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;color:#111111;">${title}</h1>
        </div>
        <div style="padding:28px;">
          ${body}
        </div>
      </div>
    </div>
  `.trim();
}

export const EMAIL_TEMPLATE_DEFINITIONS = {
  REMINDER_25TH: {
    label: "25th reminder",
    description: "Reminder to keep the current month timesheet moving.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "58",
      remainingHours: "68",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  REMINDER_28TH: {
    label: "28th reminder",
    description: "Reminder to continue filling the current month timesheet.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "74",
      remainingHours: "42",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  REMINDER_LAST_DAY: {
    label: "Last-day reminder",
    description: "Reminder to submit or complete the current month timesheet.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "91",
      remainingHours: "14",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  REMINDER_3RD: {
    label: "3rd reminder",
    description: "Reminder about the previous month before the fixed 5th-day cutoff.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "96",
      remainingHours: "6",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  FINAL_NOTICE_SUCCESS: {
    label: "Final notice success",
    description: "Sent on the fixed 5th-day cutoff when auto-submit succeeds.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "100",
      remainingHours: "0",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  FINAL_NOTICE_FAILURE: {
    label: "Final notice failure",
    description: "Sent on the fixed 5th-day cutoff when a previous month remains incomplete.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "84",
      remainingHours: "24",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  SUBMISSION_CONFIRMATION: {
    label: "Submission confirmation",
    description: "Sent after manual or automatic timesheet submission.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "100",
      remainingHours: "0",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
      breakdownHtml:
        "<table style=\"width:100%;border-collapse:collapse;\"><tr><td style=\"padding:8px;border-bottom:1px solid #e5e5e5;\">Livable Cities</td><td style=\"padding:8px;text-align:right;border-bottom:1px solid #e5e5e5;\">92</td></tr></table>",
      submissionTimestamp: "2026-03-31T17:25:00+05:30",
      submissionMethod: "Manual submit",
    },
  },
  EDIT_REQUEST_ALERT: {
    label: "Edit request alert",
    description: "Sent to approvers when a program head requests an edit window.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "96",
      remainingHours: "6",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/admin/edit-requests",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
      approverName: "Girija Admin",
      timesheetUrl: "http://localhost:3000/timesheets/sample",
      reviewUrl: "http://localhost:3000/admin/edit-requests",
    },
  },
  EDIT_APPROVED: {
    label: "Edit request approved",
    description: "Sent after an edit request is approved.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "96",
      remainingHours: "6",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
      timesheetUrl: "http://localhost:3000/timesheets/sample",
    },
  },
  EDIT_REJECTED: {
    label: "Edit request rejected",
    description: "Sent after an edit request is rejected.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "February 2026",
      completionPercentage: "96",
      remainingHours: "6",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
      timesheetUrl: "http://localhost:3000/timesheets/sample",
    },
  },
  ADMIN_AUTO_SUBMIT_NOTICE: {
    label: "Admin auto-submit notice",
    description: "Sent to admins when a timesheet is auto-submitted.",
    sampleTokens: {
      userName: "Girija Admin",
      monthLabel: "February 2026",
      completionPercentage: "100",
      remainingHours: "0",
      deadlineDate: "28/02/2026",
      autoSubmitDate: "05/03/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  AUTH_OTP_FIRST_LOGIN: {
    label: "First-time activation OTP",
    description: "Sent when an internal user starts first-time access.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "58",
      remainingHours: "68",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  AUTH_OTP_FORGOT_PASSWORD: {
    label: "Forgot password OTP",
    description: "Sent when a user requests to reset a password.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "58",
      remainingHours: "68",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
  AUTH_OTP_ACCOUNT_ACTIVATION: {
    label: "Account activation OTP",
    description: "Sent when an internal account activation code is requested.",
    sampleTokens: {
      userName: "Anita Director",
      monthLabel: "March 2026",
      completionPercentage: "58",
      remainingHours: "68",
      deadlineDate: "31/03/2026",
      autoSubmitDate: "05/04/2026",
      submitUrl: "http://localhost:3000/timesheets/sample",
      requestEditUrl: "http://localhost:3000/timesheets/sample",
      supportContactEmail: "support@janaagraha.org",
      appName: APP_NAME,
      otpCode: "123456",
      expiresInMinutes: "10",
      reason: "Need to correct previously reported hours.",
      editableUntil: "18/03/2026",
      rejectionReason: "Please align the request with payroll notes.",
      programHeadName: "Anita Director",
      totalHoursRecorded: "160",
    },
  },
} as const satisfies Record<string, TemplateDefinition>;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_DEFINITIONS;

function buildReminderBody(headline: string) {
  return buildHtmlShell(
    headline,
    `
      <p style="margin:0 0 16px;">Hello {{userName}},</p>
      <p style="margin:0 0 16px;">Your {{monthLabel}} timesheet still needs attention.</p>
      <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
        <li>Completion: {{completionPercentage}}%</li>
        <li>Remaining hours: {{remainingHours}}</li>
        <li>Submission deadline: {{deadlineDate}}</li>
        <li>Fixed auto-submit date: {{autoSubmitDate}}</li>
        <li>Open timesheet: <a href="{{submitUrl}}" style="color:#8a6a00;">{{submitUrl}}</a></li>
      </ul>
      <p style="margin:20px 0 0;color:#555555;">Need help? Contact {{supportContactEmail}}.</p>
    `,
  );
}

function buildOtpBody(headline: string, instruction: string) {
  return buildHtmlShell(
    headline,
    `
      <p style="margin:0 0 16px;">Hello {{userName}},</p>
      <p style="margin:0 0 16px;">${instruction}</p>
      <div style="margin:18px 0;padding:18px;border:1px solid #e5d995;border-radius:16px;background:#fffdf2;text-align:center;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a00;">One-time code</p>
        <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.24em;color:#111111;">{{otpCode}}</p>
      </div>
      <p style="margin:0 0 12px;color:#444444;">This code expires in {{expiresInMinutes}} minutes.</p>
      <p style="margin:0;color:#555555;">If you did not request this, contact {{supportContactEmail}}.</p>
    `,
  );
}

export const DEFAULT_EMAIL_TEMPLATE_CONTENT: Record<EmailTemplateKey, EmailTemplateContent> = {
  REMINDER_25TH: {
    subject: "Reminder: continue your {{monthLabel}} timesheet",
    html: buildReminderBody("Keep your timesheet moving"),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet is still in progress. Completion: {{completionPercentage}}%. Remaining hours: {{remainingHours}}. Deadline: {{deadlineDate}}. Open it here: {{submitUrl}}. Support: {{supportContactEmail}}.",
  },
  REMINDER_28TH: {
    subject: "Reminder: review your {{monthLabel}} timesheet",
    html: buildReminderBody("A quick check-in before month end"),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet still needs attention. Completion: {{completionPercentage}}%. Remaining hours: {{remainingHours}}. Deadline: {{deadlineDate}}. Open it here: {{submitUrl}}. Support: {{supportContactEmail}}.",
  },
  REMINDER_LAST_DAY: {
    subject: "Action needed today: submit your {{monthLabel}} timesheet",
    html: buildReminderBody("Today is the last day to review your draft"),
    text:
      "Hello {{userName}}, today is the last day to complete your {{monthLabel}} timesheet. Completion: {{completionPercentage}}%. Remaining hours: {{remainingHours}}. Deadline: {{deadlineDate}}. Open it here: {{submitUrl}}. Support: {{supportContactEmail}}.",
  },
  REMINDER_3RD: {
    subject: "Reminder: your {{monthLabel}} timesheet is still pending",
    html: buildReminderBody("The fixed 5th-day cutoff is approaching"),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet is still pending. Completion: {{completionPercentage}}%. Remaining hours: {{remainingHours}}. Fixed cutoff: {{autoSubmitDate}}. Open it here: {{submitUrl}}. Support: {{supportContactEmail}}.",
  },
  FINAL_NOTICE_SUCCESS: {
    subject: "Final notice: your {{monthLabel}} timesheet was auto-submitted",
    html: buildHtmlShell(
      "Your timesheet was auto-submitted",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <p style="margin:0 0 16px;">Your {{monthLabel}} timesheet reached exact completion and was auto-submitted at the fixed cutoff.</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Completion at cutoff: {{completionPercentage}}%</li>
          <li>Remaining hours: {{remainingHours}}</li>
          <li>Need an edit window later? <a href="{{requestEditUrl}}" style="color:#8a6a00;">{{requestEditUrl}}</a></li>
        </ul>
      `,
    ),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet was auto-submitted at the fixed cutoff. Completion: {{completionPercentage}}%. Request edit: {{requestEditUrl}}.",
  },
  FINAL_NOTICE_FAILURE: {
    subject: "Final notice: your {{monthLabel}} timesheet is now frozen",
    html: buildHtmlShell(
      "Your timesheet was frozen because it was incomplete",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <p style="margin:0 0 16px;">Your {{monthLabel}} timesheet did not reach exact completion by the fixed cutoff and is now frozen.</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Completion at cutoff: {{completionPercentage}}%</li>
          <li>Remaining hours: {{remainingHours}}</li>
          <li>Request edit: <a href="{{requestEditUrl}}" style="color:#8a6a00;">{{requestEditUrl}}</a></li>
        </ul>
      `,
    ),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet is now frozen because it was incomplete at the fixed cutoff. Completion: {{completionPercentage}}%. Remaining hours: {{remainingHours}}. Request edit: {{requestEditUrl}}.",
  },
  SUBMISSION_CONFIRMATION: {
    subject: "{{monthLabel}} timesheet submitted successfully",
    html: buildHtmlShell(
      "Your timesheet has been submitted",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Submission timestamp: {{submissionTimestamp}}</li>
          <li>Submission method: {{submissionMethod}}</li>
          <li>Total hours recorded: {{totalHoursRecorded}}</li>
        </ul>
        <div style="margin-top:20px;">{{breakdownHtml}}</div>
        <p style="margin:20px 0 0;color:#555555;">If you need to reopen the sheet later, use <a href="{{requestEditUrl}}" style="color:#8a6a00;">{{requestEditUrl}}</a>.</p>
      `,
    ),
    text:
      "Hello {{userName}}, your {{monthLabel}} timesheet has been submitted. Timestamp: {{submissionTimestamp}}. Method: {{submissionMethod}}. Total hours: {{totalHoursRecorded}}. Request edit: {{requestEditUrl}}.",
  },
  EDIT_REQUEST_ALERT: {
    subject: "Edit request pending for {{monthLabel}} timesheet",
    html: buildHtmlShell(
      "An edit request is waiting for review",
      `
        <p style="margin:0 0 16px;">Hello {{approverName}},</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Program head: {{userName}}</li>
          <li>Month: {{monthLabel}}</li>
          <li>Reason: {{reason}}</li>
          <li>Review link: <a href="{{reviewUrl}}" style="color:#8a6a00;">{{reviewUrl}}</a></li>
          <li>Timesheet link: <a href="{{timesheetUrl}}" style="color:#8a6a00;">{{timesheetUrl}}</a></li>
        </ul>
      `,
    ),
    text:
      "Hello {{approverName}}, an edit request is pending. Program head: {{userName}}. Month: {{monthLabel}}. Reason: {{reason}}. Review: {{reviewUrl}}. Timesheet: {{timesheetUrl}}.",
  },
  EDIT_APPROVED: {
    subject: "Edit request approved for {{monthLabel}}",
    html: buildHtmlShell(
      "Your edit request has been approved",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <p style="margin:0 0 16px;">Your timesheet is open again for a limited edit window.</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Editable until: {{editableUntil}}</li>
          <li>Open timesheet: <a href="{{timesheetUrl}}" style="color:#8a6a00;">{{timesheetUrl}}</a></li>
        </ul>
      `,
    ),
    text:
      "Hello {{userName}}, your edit request for {{monthLabel}} was approved. Editable until: {{editableUntil}}. Open timesheet: {{timesheetUrl}}.",
  },
  EDIT_REJECTED: {
    subject: "Edit request rejected for {{monthLabel}}",
    html: buildHtmlShell(
      "Your edit request has been rejected",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <p style="margin:0 0 16px;">Your request to reopen the timesheet was not approved.</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Reason: {{rejectionReason}}</li>
          <li>Timesheet link: <a href="{{timesheetUrl}}" style="color:#8a6a00;">{{timesheetUrl}}</a></li>
        </ul>
      `,
    ),
    text:
      "Hello {{userName}}, your edit request for {{monthLabel}} was rejected. Reason: {{rejectionReason}}. Timesheet: {{timesheetUrl}}.",
  },
  ADMIN_AUTO_SUBMIT_NOTICE: {
    subject: "Auto-submit completed for {{programHeadName}}",
    html: buildHtmlShell(
      "A timesheet was auto-submitted",
      `
        <p style="margin:0 0 16px;">Hello {{userName}},</p>
        <ul style="margin:0;padding-left:20px;line-height:1.7;color:#333333;">
          <li>Program head: {{programHeadName}}</li>
          <li>Month: {{monthLabel}}</li>
          <li>Total hours recorded: {{totalHoursRecorded}}</li>
        </ul>
      `,
    ),
    text:
      "Hello {{userName}}, {{programHeadName}} had a {{monthLabel}} timesheet auto-submitted with {{totalHoursRecorded}} recorded hours.",
  },
  AUTH_OTP_FIRST_LOGIN: {
    subject: `Your ${APP_NAME} activation code`,
    html: buildOtpBody("Finish setting up your account", "Use this one-time code to confirm your email and set your password."),
    text:
      "Hello {{userName}}, your activation code for {{appName}} is {{otpCode}}. It expires in {{expiresInMinutes}} minutes. If you did not request this, contact {{supportContactEmail}}.",
  },
  AUTH_OTP_FORGOT_PASSWORD: {
    subject: `Your ${APP_NAME} password reset code`,
    html: buildOtpBody("Reset your password", "Use this one-time code to continue with password reset."),
    text:
      "Hello {{userName}}, your password reset code for {{appName}} is {{otpCode}}. It expires in {{expiresInMinutes}} minutes. If you did not request this, contact {{supportContactEmail}}.",
  },
  AUTH_OTP_ACCOUNT_ACTIVATION: {
    subject: `Your ${APP_NAME} account activation code`,
    html: buildOtpBody("Activate your account", "Use this one-time code to activate your internal account and create your password."),
    text:
      "Hello {{userName}}, your account activation code for {{appName}} is {{otpCode}}. It expires in {{expiresInMinutes}} minutes. If you did not request this, contact {{supportContactEmail}}.",
  },
};

export function normalizeTemplateValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function replaceTokens(input: string, tokens: Record<string, string>) {
  return input.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, key: string) => {
    return tokens[key] ?? "";
  });
}

function stripHtml(input: string) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizePreviewHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/\son[a-z]+="[^"]*"/gi, "")
    .replace(/\son[a-z]+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export function renderEmailTemplate(
  key: EmailTemplateKey,
  tokens: Record<string, unknown>,
  templates: Record<EmailTemplateKey, EmailTemplateContent>,
) {
  const normalizedTokens = Object.fromEntries(
    Object.entries(tokens).map(([tokenKey, tokenValue]) => [
      tokenKey,
      normalizeTemplateValue(tokenValue),
    ]),
  );

  const template = templates[key];
  const subject = replaceTokens(template.subject, normalizedTokens);
  const html = replaceTokens(template.html, normalizedTokens);
  const textSource = template.text.trim() ? template.text : stripHtml(template.html);
  const text = replaceTokens(textSource, normalizedTokens);

  return { subject, html, text };
}

export function buildEmailTemplatePreview(
  key: EmailTemplateKey,
  templates: Record<EmailTemplateKey, EmailTemplateContent>,
) {
  const definition = EMAIL_TEMPLATE_DEFINITIONS[key];
  const previewTokens = Object.fromEntries(
    Object.entries(definition.sampleTokens).map(([tokenKey, tokenValue]) => [
      tokenKey,
      tokenKey.endsWith("Url")
        ? tokenValue.replace(DEFAULT_SAMPLE_BASE_URL, env.appBaseUrl)
        : tokenValue,
    ]),
  );
  const rendered = renderEmailTemplate(key, previewTokens, templates);

  return {
    subject: rendered.subject,
    html: sanitizePreviewHtml(rendered.html),
    text: rendered.text,
  };
}
