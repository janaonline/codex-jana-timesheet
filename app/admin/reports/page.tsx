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
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin/reports"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Reports and exports</p>
        <h2 className="text-4xl font-semibold text-stone-950">MVP reporting suite</h2>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          Review the approved compliance, utilization, and edit-request reports and
          export them in PDF or CSV format.
        </p>
      </Card>

      <div className="grid gap-6">
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-stone-950">
                Submission Compliance Report
              </h3>
              <p className="text-sm text-stone-600">{compliance.monthLabel}</p>
            </div>
            <ReportExportActions type="compliance" monthKey={compliance.monthKey} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">On-time</p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">
                {compliance.summary.onTimeSubmissions}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Pending</p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">
                {compliance.summary.pendingTimesheets}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Auto-submit success</p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">
                {compliance.summary.autoSubmitSuccessCount}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Auto-submit failure</p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">
                {compliance.summary.autoSubmitFailureCount}
              </p>
            </Card>
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-stone-950">
                Hours Utilization Report
              </h3>
              <p className="text-sm text-stone-600">{hours.monthLabel}</p>
            </div>
            <ReportExportActions type="hours-utilization" monthKey={hours.monthKey} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {hours.totalsByDirector.slice(0, 8).map((item) => (
              <div
                key={item.directorName}
                className="rounded-[24px] border border-stone-200 bg-stone-50 px-4 py-4 text-sm"
              >
                <p className="font-semibold text-stone-900">{item.directorName}</p>
                <p className="mt-1 text-stone-600">{item.totalHours} hours</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-2xl font-semibold text-stone-950">Edit Request Report</h3>
              <p className="text-sm text-stone-600">
                Approval rate {editRequests.summary.approvalRate}% | Rejection rate{" "}
                {editRequests.summary.rejectionRate}%
              </p>
            </div>
            <ReportExportActions type="edit-requests" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {editRequests.requests.slice(0, 9).map((item) => (
              <div
                key={`${item.requesterName}-${item.requestedAt}`}
                className="rounded-[24px] border border-stone-200 bg-stone-50 px-4 py-4 text-sm"
              >
                <p className="font-semibold text-stone-900">{item.requesterName}</p>
                <p className="mt-1 text-stone-600">
                  {item.monthLabel} | {item.status}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PortalShell>
  );
}
