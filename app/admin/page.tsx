import { redirect } from "next/navigation";

import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getComplianceReport, getEditRequestReport } from "@/services/report-service";
import { getSystemConfiguration } from "@/services/configuration-service";
import { ConfigurationPanel } from "@/components/admin/configuration-panel";
import {
  updateApproverMappingsAction,
  updateConfigurationAction,
} from "@/app/admin/actions";

export default async function AdminPage() {
  const session = await requireAppSession();

  if (session.user.role === "PROGRAM_HEAD") {
    redirect("/dashboard");
  }

  const [compliance, editReport, config, programHeads, approvers] = await Promise.all([
    getComplianceReport(),
    getEditRequestReport(),
    getSystemConfiguration(),
    prisma.user.findMany({
      where: {
        role: "PROGRAM_HEAD",
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
      userName={session.user.name ?? session.user.email ?? "Admin"}
      currentPath="/admin"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Admin dashboard</p>
        <h2 className="text-4xl font-semibold text-stone-950">Operational oversight</h2>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">
          This MVP admin view focuses on compliance, reminder outcomes, edit requests, and
          lean oversight reporting without adding advanced analytics outside the documented
          scope.
        </p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">On-time submissions</p>
          <p className="mt-3 text-3xl font-semibold text-stone-950">
            {compliance.summary.onTimeSubmissions}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Pending timesheets</p>
          <p className="mt-3 text-3xl font-semibold text-stone-950">
            {compliance.summary.pendingTimesheets}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Edit requests</p>
          <p className="mt-3 text-3xl font-semibold text-stone-950">
            {editReport.summary.totalRequests}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Average response</p>
          <p className="mt-3 text-3xl font-semibold text-stone-950">
            {editReport.summary.averageResponseHours}h
          </p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <h3 className="text-xl font-semibold text-stone-950">Pending by director</h3>
          {compliance.pendingByDirector.slice(0, 8).map((item) => (
            <div
              key={item.directorName}
              className="rounded-[22px] bg-stone-50 px-4 py-4 text-sm"
            >
              <p className="font-semibold text-stone-900">{item.directorName}</p>
              <p className="mt-1 text-stone-600">
                {item.status} • {item.completionPercentage}% complete
              </p>
            </div>
          ))}
        </Card>
        <Card className="space-y-4">
          <h3 className="text-xl font-semibold text-stone-950">Common edit reasons</h3>
          {editReport.commonReasons.map((item) => (
            <div
              key={item.reason}
              className="rounded-[22px] bg-stone-50 px-4 py-4 text-sm"
            >
              <p className="font-semibold text-stone-900">{item.reason}</p>
              <p className="mt-1 text-stone-600">{item.count} requests</p>
            </div>
          ))}
        </Card>
      </div>

      <ConfigurationPanel
        config={config}
        programHeads={programHeads}
        approvers={approvers}
        onConfigSubmit={updateConfigurationAction}
        onApproverSubmit={updateApproverMappingsAction}
      />
    </PortalShell>
  );
}
