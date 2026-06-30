import { ReportExportActions } from "@/components/admin/report-export-actions";
import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import {
  getComplianceReport,
  getEditRequestReport,
  getHoursUtilizationReport,
} from "@/services/report-service";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ monthKey?: string }>;
}) {
  const session = await requireAppSession({
    permission: "reports:read:admin",
  });

  const { monthKey } = await searchParams;
  const [compliance, hours, editRequests] = await Promise.all([
    getComplianceReport(monthKey),
    getHoursUtilizationReport(monthKey),
    getEditRequestReport(),
  ]);

  return (
    <PortalShell
      role={session.user.role}
      designation={session.user.designation}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin/reports"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-(--color-text-muted)">Reports and exports</p>
        <h2 className="text-4xl font-semibold text-(--color-text)">MVP reporting suite</h2>
        <p className="max-w-3xl text-sm leading-6 text-(--color-text-muted)">
          Review the approved compliance, utilization, and edit-request reports and
          export them in PDF or CSV format.
        </p>
      </Card>

      <div className="grid gap-6">
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-(--color-text)">
                Submission Compliance Report
              </h3>
              <p className="text-sm text-(--color-text-muted)">{compliance.monthLabel}</p>
            </div>
            <ReportExportActions type="compliance" monthKey={compliance.monthKey} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">On-time</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {compliance.summary.onTimeSubmissions}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Pending</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {compliance.summary.pendingTimesheets}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Auto-submit success</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {compliance.summary.autoSubmitSuccessCount}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Auto-submit failure</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {compliance.summary.autoSubmitFailureCount}
              </p>
            </Card>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-(--color-text)">
                Hours Utilization Report
              </h3>
              <p className="text-sm text-(--color-text-muted)">{hours.monthLabel}</p>
            </div>
            <ReportExportActions type="hours-utilization" monthKey={hours.monthKey} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hours.totalsByDirector.slice(0, 8).map((item) => (
              <div
                key={item.directorName}
                className="rounded-[24px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm"
              >
                <p className="font-semibold text-(--color-text)">{item.directorName}</p>
              <p className="mt-1 text-(--color-text-muted)">{item.totalHours} hours</p>
            </div>
          ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {hours.entryOriginSummary.map((item) => (
              <Card key={item.entryType}>
                <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">
                  {item.entryType}
                </p>
                <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                  {item.totalHours} hours
                </p>
                <p className="mt-1 text-sm text-(--color-text-muted)">{item.rowCount} rows</p>
              </Card>
            ))}
          </div>
          <div className="overflow-x-auto rounded-[24px] border border-(--color-border)">
            <table className="min-w-full divide-y divide-(--color-border) text-left text-sm">
              <thead className="bg-(--color-surface-raised) text-(--color-text-muted)">
                <tr>
                  <th className="px-4 py-3 font-medium">Director</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Hours</th>
                  <th className="px-4 py-3 font-medium">Entry Type</th>
                  <th className="px-4 py-3 font-medium">Created Via</th>
                  <th className="px-4 py-3 font-medium">Last Edited Via</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border) bg-(--color-surface) text-(--color-text-subtle)">
                {hours.entryDetails.slice(0, 8).map((item) => (
                  <tr key={`${item.directorName}-${item.date}-${item.subProgramName}`}>
                    <td className="px-4 py-3">{item.directorName}</td>
                    <td className="px-4 py-3">
                      {new Intl.DateTimeFormat("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(item.date))}
                    </td>
                    <td className="px-4 py-3">{item.subProgramName}</td>
                    <td className="px-4 py-3">{item.hours}</td>
                    <td className="px-4 py-3">{item.entryType}</td>
                    <td className="px-4 py-3">{item.createdVia}</td>
                    <td className="px-4 py-3">{item.lastEditedVia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-(--color-text)">Edit Request Report</h3>
              <p className="text-sm text-(--color-text-muted)">
                Director and Associate Director requests only.
              </p>
            </div>
            <ReportExportActions type="edit-requests" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Total</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {editRequests.summary.totalRequests}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Approved</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {editRequests.summary.approvedCount}
              </p>
              <p className="mt-1 text-sm text-(--color-text-muted)">
                {editRequests.summary.approvalRate}% approval rate
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Rejected</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {editRequests.summary.rejectedCount}
              </p>
              <p className="mt-1 text-sm text-(--color-text-muted)">
                {editRequests.summary.rejectionRate}% rejection rate
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">Expired</p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {editRequests.summary.expiredCount}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-(--color-text-muted)">
                Average response
              </p>
              <p className="mt-2 text-2xl font-semibold text-(--color-text)">
                {editRequests.summary.averageResponseHours}h
              </p>
            </Card>
          </div>
          <div className="overflow-x-auto rounded-[24px] border border-(--color-border)">
            <table className="min-w-full divide-y divide-(--color-border) text-left text-sm">
              <thead className="bg-(--color-surface-raised) text-(--color-text-muted)">
                <tr>
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Requested at</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="px-4 py-3 font-medium">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border) bg-(--color-surface) text-(--color-text-subtle)">
                {editRequests.detailedRows.slice(0, 12).map((item) => (
                  <tr key={`${item.requesterName}-${item.requestedAt}-${item.monthKey}`}>
                    <td className="px-4 py-3">{item.requesterName}</td>
                    <td className="px-4 py-3">
                      {new Intl.DateTimeFormat("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(item.requestedAt))}
                    </td>
                    <td className="px-4 py-3">{item.status}</td>
                    <td className="px-4 py-3">{item.monthLabel}</td>
                    <td className="px-4 py-3">{item.completionPercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PortalShell>
  );
}
