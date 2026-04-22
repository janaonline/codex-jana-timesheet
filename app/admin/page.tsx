import { OperationalOversightFilters } from "@/components/admin/operational-oversight-filters";
import { ConfigurationPanel } from "@/components/admin/configuration-panel";
import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import {
  updateApproverMappingsAction,
  updateConfigurationAction,
} from "@/app/admin/actions";
import {
  EDIT_REQUEST_METRIC_FILTERS,
  type EditRequestMetricFilter,
} from "@/lib/constants";
import { requireAppSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/rbac";
import { isValidMonthKey } from "@/lib/time";
import { getSystemConfiguration } from "@/services/configuration-service";
import { getAdminOperationalOversight } from "@/services/report-service";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    oversightMonthKey?: string;
    editRequestStatus?: string;
  }>;
}) {
  const session = await requireAppSession({
    permission: "reports:read:admin",
  });
  const filters = await searchParams;
  const selectedMonthKey =
    filters.oversightMonthKey && isValidMonthKey(filters.oversightMonthKey)
      ? filters.oversightMonthKey
      : null;
  const selectedEditRequestStatus = EDIT_REQUEST_METRIC_FILTERS.includes(
    (filters.editRequestStatus ?? "ALL") as EditRequestMetricFilter,
  )
    ? (filters.editRequestStatus as EditRequestMetricFilter | undefined) ?? "ALL"
    : "ALL";

  const [oversight, config, programHeads, approvers] = await Promise.all([
    getAdminOperationalOversight({
      monthKey: selectedMonthKey,
      editRequestStatus: selectedEditRequestStatus,
    }),
    getSystemConfiguration(),
    prisma.user.findMany({
      where: {
        role: {
          in: ["PROGRAM_HEAD", "ASSOCIATE_DIRECTOR"],
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        approverUserId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        role: "ADMIN",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <PortalShell
      role={session.user.role}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-(--color-text-muted)">Admin dashboard</p>
        <h2 className="text-4xl font-semibold text-(--color-text)">Operational oversight</h2>
        <p className="max-w-3xl text-sm leading-6 text-(--color-text-muted)">
          Review real-time timesheet operations for {oversight.selectedMonthLabel} and
          manage internal settings without changing the approved core workflow rules.
        </p>
      </Card>

      <OperationalOversightFilters
        availableMonths={oversight.availableMonths}
        selectedMonthKey={oversight.selectedMonthKey}
        selectedEditRequestStatus={oversight.editRequests.selectedStatus}
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">On-time submissions</p>
          <p className="mt-3 text-3xl font-semibold text-(--color-text)">
            {oversight.summary.onTimeSubmissions}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">Pending timesheets</p>
          <p className="mt-3 text-3xl font-semibold text-(--color-text)">
            {oversight.summary.pendingTimesheets}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
            {oversight.editRequests.selectedStatus === "ALL"
              ? "Edit requests"
              : `${oversight.editRequests.selectedStatus.toLowerCase()} edit requests`}
          </p>
          <p className="mt-3 text-3xl font-semibold text-(--color-text)">
            {oversight.editRequests.count}
          </p>
          <p className="mt-2 text-sm text-(--color-text-muted)">
            Pending {oversight.editRequests.countsByStatus.pending} | Approved{" "}
            {oversight.editRequests.countsByStatus.approved} | Rejected{" "}
            {oversight.editRequests.countsByStatus.rejected} | Expired{" "}
            {oversight.editRequests.countsByStatus.expired}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">Average response</p>
          <p className="mt-3 text-3xl font-semibold text-(--color-text)">
            {oversight.summary.averageResponseHours}h
          </p>
        </Card>
      </div>

      {hasPermission(
        session.user.role,
        "configuration:manage",
        config.roleAccess,
      ) ? (
        <ConfigurationPanel
          config={config}
          programHeads={programHeads}
          approvers={approvers}
          onConfigSubmit={updateConfigurationAction}
          onApproverSubmit={updateApproverMappingsAction}
        />
      ) : null}
    </PortalShell>
  );
}
