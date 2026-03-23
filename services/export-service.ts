import PDFDocument from "pdfkit";

import {
  getComplianceReport,
  getEditRequestReport,
  getHoursUtilizationReport,
  type ComplianceReport,
  type EditRequestReport,
  type HoursUtilizationReport,
} from "@/services/report-service";

type ReportType = "compliance" | "hours-utilization" | "edit-requests";
type ExportFormat = "pdf" | "csv" | "excel";

function streamToBuffer(document: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.end();
  });
}

function addTableRows(doc: PDFKit.PDFDocument, rows: string[]) {
  rows.forEach((row) => {
    doc.fontSize(11).text(row, {
      lineGap: 4,
    });
  });
}

async function buildCompliancePdf(report: ComplianceReport) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).text(`Submission Compliance Report - ${report.monthLabel}`);
  doc.moveDown();
  addTableRows(doc, [
    `Total program heads: ${report.summary.totalProgramHeads}`,
    `On-time submissions: ${report.summary.onTimeSubmissions}`,
    `Pending timesheets: ${report.summary.pendingTimesheets}`,
    `Auto-submit success count: ${report.summary.autoSubmitSuccessCount}`,
    `Auto-submit failure count: ${report.summary.autoSubmitFailureCount}`,
    "",
    "Pending timesheets:",
    ...report.pendingByDirector.map(
      (item) =>
        `${item.directorName} | ${item.status} | ${item.completionPercentage}%`,
    ),
  ]);
  return streamToBuffer(doc);
}

async function buildHoursPdf(report: HoursUtilizationReport) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).text(`Hours Utilization Report - ${report.monthLabel}`);
  doc.moveDown();
  addTableRows(doc, [
    "Totals by director:",
    ...report.totalsByDirector.map(
      (item) => `${item.directorName} | ${item.totalHours} hours`,
    ),
    "",
    "Totals by sub-program:",
    ...report.totalsBySubProgram.map(
      (item) => `${item.subProgramName} | ${item.totalHours} hours`,
    ),
  ]);
  return streamToBuffer(doc);
}

async function buildEditRequestPdf(report: EditRequestReport) {
  const doc = new PDFDocument({ margin: 40 });
  doc.fontSize(18).text("Edit Request Report");
  doc.moveDown();
  addTableRows(doc, [
    `Total requests: ${report.summary.totalRequests}`,
    `Approval rate: ${report.summary.approvalRate}%`,
    `Rejection rate: ${report.summary.rejectionRate}%`,
    `Average response hours: ${report.summary.averageResponseHours}`,
    "",
    "Recent requests:",
    ...report.requests.slice(0, 20).map(
      (request) =>
        `${request.requesterName} | ${request.monthLabel} | ${request.status} | ${request.responseHours ?? "Pending"} hours`,
    ),
  ]);
  return streamToBuffer(doc);
}

function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}

function buildComplianceCsv(report: ComplianceReport) {
  return toCsv([
    ["Metric", "Value"],
    ["Month", report.monthLabel],
    ["Total program heads", report.summary.totalProgramHeads],
    ["On-time submissions", report.summary.onTimeSubmissions],
    ["Pending timesheets", report.summary.pendingTimesheets],
    ["Auto-submit success count", report.summary.autoSubmitSuccessCount],
    ["Auto-submit failure count", report.summary.autoSubmitFailureCount],
    [],
    ["Director", "Status", "Completion Percentage"],
    ...report.pendingByDirector.map((item) => [
      item.directorName,
      item.status,
      item.completionPercentage,
    ]),
  ]);
}

function buildHoursCsv(report: HoursUtilizationReport) {
  return toCsv([
    ["Month", report.monthLabel],
    [],
    ["Director", "Total Hours"],
    ...report.totalsByDirector.map((item) => [item.directorName, item.totalHours]),
    [],
    ["Sub-program", "Total Hours"],
    ...report.totalsBySubProgram.map((item) => [item.subProgramName, item.totalHours]),
  ]);
}

function buildEditRequestCsv(report: EditRequestReport) {
  return toCsv([
    ["Metric", "Value"],
    ["Total requests", report.summary.totalRequests],
    ["Approval rate", report.summary.approvalRate],
    ["Rejection rate", report.summary.rejectionRate],
    ["Average response hours", report.summary.averageResponseHours],
    [],
    ["Requester", "Month", "Status", "Requested At", "Reviewed At", "Response Hours"],
    ...report.requests.map((request) => [
      request.requesterName,
      request.monthLabel,
      request.status,
      request.requestedAt,
      request.reviewedAt ?? "",
      request.responseHours ?? "",
    ]),
  ]);
}

export async function generateReportExport(params: {
  type: ReportType;
  format: ExportFormat;
  monthKey?: string;
}) {
  if (params.type === "compliance") {
    const report = await getComplianceReport(params.monthKey);
    if (params.format === "pdf") {
      return {
        body: await buildCompliancePdf(report),
        contentType: "application/pdf",
        fileName: `compliance-report-${report.monthKey}.pdf`,
      };
    }

    return {
      body: buildComplianceCsv(report),
      contentType: "text/csv; charset=utf-8",
      fileName: `compliance-report-${report.monthKey}.csv`,
    };
  }

  if (params.type === "hours-utilization") {
    const report = await getHoursUtilizationReport(params.monthKey);
    if (params.format === "pdf") {
      return {
        body: await buildHoursPdf(report),
        contentType: "application/pdf",
        fileName: `hours-utilization-${report.monthKey}.pdf`,
      };
    }

    return {
      body: buildHoursCsv(report),
      contentType: "text/csv; charset=utf-8",
      fileName: `hours-utilization-${report.monthKey}.csv`,
    };
  }

  const report = await getEditRequestReport();
  if (params.format === "pdf") {
    return {
      body: await buildEditRequestPdf(report),
      contentType: "application/pdf",
      fileName: "edit-requests-report.pdf",
    };
  }

  return {
    body: buildEditRequestCsv(report),
    contentType: "text/csv; charset=utf-8",
    fileName: "edit-requests-report.csv",
  };
}
