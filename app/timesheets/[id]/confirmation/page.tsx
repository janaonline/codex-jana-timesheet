import Link from "next/link";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import { getTimesheetForActor } from "@/services/timesheet-service";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAppSession();
  const { id } = await params;
  const data = await getTimesheetForActor(id, {
    userId: session.user.id,
    role: session.user.role,
  });

  return (
    <PortalShell
      role={session.user.role}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "User"}
      currentPath="/dashboard"
    >
      <Card className="max-w-3xl space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Submission confirmation
        </p>
        <h2 className="text-4xl font-semibold text-stone-950">
          {data.timesheet.monthLabel} timesheet submitted
        </h2>
        <Badge tone={data.timesheet.status}>
          {data.timesheet.status.replaceAll("_", " ")}
        </Badge>
        <p className="text-sm leading-6 text-stone-600">
          Submission confirmation email has been queued. The timesheet is now locked and can
          only be reopened through the previous-month request edit workflow.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Recorded</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {data.timesheet.totalHours}h
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Assigned</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {data.timesheet.assignedHours}h
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Completion</p>
            <p className="mt-2 text-2xl font-semibold text-stone-950">
              {data.timesheet.completionPercentage}%
            </p>
          </Card>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard">
            <Button>Return to dashboard</Button>
          </Link>
          <Link href={`/timesheets/${data.timesheet.id}`}>
            <Button variant="secondary">View timesheet</Button>
          </Link>
        </div>
      </Card>
    </PortalShell>
  );
}
