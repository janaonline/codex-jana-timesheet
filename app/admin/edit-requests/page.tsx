import { redirect } from "next/navigation";

import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import { listPendingEditRequests } from "@/services/timesheet-service";
import { EditRequestTable } from "@/components/admin/edit-request-table";
import { EmptyState } from "@/components/common/empty-state";
import { getMonthLabel } from "@/lib/time";

export default async function EditRequestsPage() {
  const session = await requireAppSession();

  if (session.user.role === "PROGRAM_HEAD") {
    redirect("/dashboard");
  }

  const requests = await listPendingEditRequests();

  return (
    <PortalShell
      role={session.user.role}
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin/edit-requests"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Pending edit requests
        </p>
        <h2 className="text-4xl font-semibold text-stone-950">Unfreeze approvals</h2>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          Approvers can approve or reject only. They cannot directly edit directors&apos;
          timesheets, which keeps this flow aligned with the document&apos;s clarified
          unfreeze model.
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
          description="All edit requests have been reviewed."
        />
      )}
    </PortalShell>
  );
}
