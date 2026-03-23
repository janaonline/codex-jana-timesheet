import type { ReminderKind } from "@/lib/constants";
import { formatDisplayDate } from "@/lib/time";

type TemplateDefinition = {
  subject: string;
  headline: string;
  guidance: string;
};

export const DEFAULT_EMAIL_TEMPLATE_CONTENT: Record<string, TemplateDefinition> = {
  REMINDER_25TH: {
    subject:
      "[Stakeholder subject pending] Reminder: Please update your {{month}} timesheet",
    headline: "Upcoming timesheet due",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  REMINDER_28TH: {
    subject:
      "[Stakeholder subject pending] Reminder: Continue updating your {{month}} timesheet",
    headline: "Continue filling your timesheet",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  REMINDER_LAST_DAY: {
    subject:
      "[Stakeholder subject pending] Action required: Submit your {{month}} timesheet today",
    headline: "Submit your timesheet today",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  REMINDER_3RD: {
    subject:
      "[Stakeholder subject pending] Urgent: {{month}} timesheet not submitted",
    headline: "Second reminder",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  FINAL_NOTICE_SUCCESS: {
    subject:
      "[Stakeholder subject pending] Final notice: {{month}} timesheet auto-submission status",
    headline: "Your timesheet was automatically submitted",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  FINAL_NOTICE_FAILURE: {
    subject:
      "[Stakeholder subject pending] Final notice: {{month}} timesheet auto-submission status",
    headline: "Your timesheet was not submitted because it was incomplete",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  SUBMISSION_CONFIRMATION: {
    subject:
      "[Stakeholder subject pending] {{month}} Timesheet Submitted Successfully",
    headline: "Timesheet submitted successfully",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  EDIT_REQUEST_ALERT: {
    subject:
      "[Stakeholder subject pending] Edit request received for {{month}} timesheet",
    headline: "Unfreeze request pending review",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  EDIT_APPROVED: {
    subject:
      "[Stakeholder subject pending] Edit request approved for {{month}} timesheet",
    headline: "Edit request approved",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
  EDIT_REJECTED: {
    subject:
      "[Stakeholder subject pending] Edit request rejected for {{month}} timesheet",
    headline: "Edit request rejected",
    guidance:
      "Stakeholder-provided subject line and email copy are pending final approval. This placeholder preserves the required content blocks only.",
  },
};

function replaceMonth(subject: string, monthLabel: string) {
  return subject.replace("{{month}}", monthLabel);
}

function shell({
  heading,
  guidance,
  body,
}: {
  heading: string;
  guidance: string;
  body: string;
}) {
  return `
    <div style="font-family: Arial, sans-serif; background: #f5f3eb; padding: 24px; color: #1f2937;">
      <div style="max-width: 720px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; border: 1px solid #e5dccb;">
        <div style="background: linear-gradient(135deg, #0f766e, #1d4ed8); color: white; padding: 24px 28px;">
          <p style="margin: 0 0 10px; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;">Stakeholder-owned placeholder template</p>
          <h1 style="margin: 0; font-size: 28px; line-height: 1.2;">${heading}</h1>
        </div>
        <div style="padding: 28px;">
          <div style="background: #fff7ed; border: 1px solid #fdba74; color: #9a3412; padding: 16px; border-radius: 14px; margin-bottom: 24px;">
            ${guidance}
          </div>
          ${body}
        </div>
      </div>
    </div>
  `;
}

function list(items: string[]) {
  return `<ul style="padding-left: 18px; line-height: 1.6;">${items
    .map((item) => `<li>${item}</li>`)
    .join("")}</ul>`;
}

export function buildReminderEmail(params: {
  kind: ReminderKind;
  monthLabel: string;
  userName: string;
  completionPercentage: number;
  remainingHours: number;
  daysRemaining: number;
  deadlineDate: string;
  autoSubmitDate: string;
  submitUrl?: string;
  requestEditUrl?: string;
  supportContactEmail: string;
}) {
  const definition = DEFAULT_EMAIL_TEMPLATE_CONTENT[params.kind];
  const subject = replaceMonth(definition.subject, params.monthLabel);
  const sharedItems = [
    `Current completion percentage: ${params.completionPercentage}%`,
    `Remaining hours: ${params.remainingHours}`,
    `Deadline: ${formatDisplayDate(params.deadlineDate)}`,
    `Auto-submit date: ${formatDisplayDate(params.autoSubmitDate)}`,
    `Support contact: ${params.supportContactEmail}`,
  ];

  const body = shell({
    heading: definition.headline,
    guidance: definition.guidance,
    body: `
      <p>Dear ${params.userName},</p>
      <p>Your ${params.monthLabel} timesheet still needs attention.</p>
      ${list([
        ...sharedItems,
        `Days remaining: ${params.daysRemaining}`,
        params.submitUrl
          ? `Manual submit link: <a href="${params.submitUrl}">${params.submitUrl}</a>`
          : "Manual submit link will be enabled in the application when applicable.",
        params.kind === "FINAL_NOTICE_5TH"
          ? "Warning: incomplete timesheets will not auto-submit."
          : "Warning: incomplete timesheets will not auto-submit on the 5th.",
        params.requestEditUrl
          ? `Request unfreeze link: <a href="${params.requestEditUrl}">${params.requestEditUrl}</a>`
          : "Request unfreeze option is available in the application if the timesheet is frozen.",
      ])}
    `,
  });

  return { subject, html: body };
}

export function buildFinalNoticeEmail(params: {
  monthLabel: string;
  userName: string;
  completionPercentage: number;
  remainingHours: number;
  autoSubmitted: boolean;
  requestEditUrl?: string;
  supportContactEmail: string;
}) {
  const definition =
    DEFAULT_EMAIL_TEMPLATE_CONTENT[
      params.autoSubmitted ? "FINAL_NOTICE_SUCCESS" : "FINAL_NOTICE_FAILURE"
    ];

  const body = shell({
    heading: definition.headline,
    guidance: definition.guidance,
    body: `
      <p>Dear ${params.userName},</p>
      ${list([
        `Completion percentage at cutoff: ${params.completionPercentage}%`,
        `Remaining hours: ${params.remainingHours}`,
        `Support contact: ${params.supportContactEmail}`,
        params.requestEditUrl
          ? `Request unfreeze link: <a href="${params.requestEditUrl}">${params.requestEditUrl}</a>`
          : "Request unfreeze is available in the application for incomplete timesheets.",
      ])}
    `,
  });

  return {
    subject: replaceMonth(definition.subject, params.monthLabel),
    html: body,
  };
}

export function buildSubmissionConfirmationEmail(params: {
  monthLabel: string;
  userName: string;
  submissionTimestamp: string;
  submissionMethod: "manual" | "auto";
  totalHoursRecorded: number;
  breakdownHtml: string;
  requestEditUrl?: string;
}) {
  const definition = DEFAULT_EMAIL_TEMPLATE_CONTENT.SUBMISSION_CONFIRMATION;
  return {
    subject: replaceMonth(definition.subject, params.monthLabel),
    html: shell({
      heading: definition.headline,
      guidance: definition.guidance,
      body: `
        <p>Dear ${params.userName},</p>
        ${list([
          `Submission timestamp: ${params.submissionTimestamp}`,
          `Submission method: ${params.submissionMethod === "auto" ? "Auto-submit" : "Manual submit"}`,
          `Total hours recorded: ${params.totalHoursRecorded}`,
          "Next step: the timesheet is now locked.",
          params.requestEditUrl
            ? `Unfreeze option: <a href="${params.requestEditUrl}">${params.requestEditUrl}</a>`
            : "Unfreeze option is available inside the application if needed.",
        ])}
        <h3 style="margin-top: 24px;">Breakdown by sub-program</h3>
        ${params.breakdownHtml}
      `,
    }),
  };
}

export function buildEditRequestAlertEmail(params: {
  monthLabel: string;
  requesterName: string;
  approverName: string;
  reason: string;
  reviewUrl: string;
  timesheetUrl: string;
}) {
  const definition = DEFAULT_EMAIL_TEMPLATE_CONTENT.EDIT_REQUEST_ALERT;
  return {
    subject: replaceMonth(definition.subject, params.monthLabel),
    html: shell({
      heading: definition.headline,
      guidance: definition.guidance,
      body: `
        <p>Hello ${params.approverName},</p>
        ${list([
          `Program head: ${params.requesterName}`,
          `Month: ${params.monthLabel}`,
          `Reason: ${params.reason}`,
          `Review request: <a href="${params.reviewUrl}">${params.reviewUrl}</a>`,
          `View current timesheet: <a href="${params.timesheetUrl}">${params.timesheetUrl}</a>`,
        ])}
      `,
    }),
  };
}

export function buildEditDecisionEmail(params: {
  monthLabel: string;
  userName: string;
  approved: boolean;
  editableUntil?: Date | null;
  rejectionReason?: string | null;
  timesheetUrl: string;
}) {
  const definition = DEFAULT_EMAIL_TEMPLATE_CONTENT[
    params.approved ? "EDIT_APPROVED" : "EDIT_REJECTED"
  ];

  const bodyItems = params.approved
    ? [
        "Your edit request has been approved.",
        params.editableUntil
          ? `Timesheet remains editable until ${formatDisplayDate(params.editableUntil)}.`
          : "Timesheet remains editable for 3 working days.",
        `Open timesheet: <a href="${params.timesheetUrl}">${params.timesheetUrl}</a>`,
      ]
    : [
        "Your edit request was rejected.",
        params.rejectionReason
          ? `Rejection reason: ${params.rejectionReason}`
          : "Rejection reason was not provided.",
        `You can submit a fresh request later from the timesheet page: <a href="${params.timesheetUrl}">${params.timesheetUrl}</a>`,
      ];

  return {
    subject: replaceMonth(definition.subject, params.monthLabel),
    html: shell({
      heading: definition.headline,
      guidance: definition.guidance,
      body: `
        <p>Dear ${params.userName},</p>
        ${list(bodyItems)}
      `,
    }),
  };
}
