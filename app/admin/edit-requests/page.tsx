import { EditRequestTable } from "@/components/admin/edit-request-table";
import { Card } from "@/components/common/card";
import { EmptyState } from "@/components/common/empty-state";
import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import { getMonthLabel } from "@/lib/time";
import { listPendingEditRequests } from "@/services/timesheet-service";

export default async function EditRequestsPage() {
  const session = await requireAppSession({
    permission: "edit-requests:review",
  });

  const requests = await listPendingEditRequests();

  return (
    <PortalShell
      role={session.user.role}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin/edit-requests"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Pending edit requests
        </p>
        <h2 className="text-4xl font-semibold text-stone-950">Unfreeze approvals</h2>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          Review requests from program heads who need a short edit window on a previous
          month that has already been submitted or frozen.
        </p>
      </Card>

      {requests.length ? (
        <EditRequestTable
          initialRequests={requests.map((request) => ({
            id: request.id,
            requesterName: request.requestedBy.name,
            requesterEmail: request.requestedBy.email,
            monthLabel: getMonthLabel(request.timesheet.monthKey),
            status: request.status,
            reason: request.reason,
            requestedAt: request.requestedAt.toISOString(),
            timesheetId: request.timesheetId,
          }))}
        />
      ) : (
        <EmptyState
          title="No pending requests"
          description="All edit requests have already been reviewed."
        />
      )}
    </PortalShell>
  );
}
