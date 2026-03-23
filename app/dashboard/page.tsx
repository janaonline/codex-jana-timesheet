import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { PortalShell } from "@/components/common/portal-shell";
import { ProgressBar } from "@/components/common/progress-bar";
import { PieChart } from "@/components/dashboard/pie-chart";
import { requireAppSession } from "@/lib/auth";
import { getDashboardData } from "@/services/timesheet-service";
import { formatDisplayDate } from "@/lib/time";

export default async function DashboardPage() {
  const session = await requireAppSession();

  if (session.user.role !== "PROGRAM_HEAD") {
    redirect("/admin");
  }

  const dashboard = await getDashboardData(session.user.id);

  return (
    <PortalShell
      role={session.user.role}
      userName={session.user.name ?? session.user.email ?? "Program Head"}
      currentPath="/dashboard"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-500">
          Program head dashboard
        </p>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold text-stone-950">
              {dashboard.currentTimesheet.monthLabel}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
              Track daily contributions, keep the draft complete, and make sure the
              previous month is manually submitted before the 5th cutoff if it is not
              eligible for auto-submit.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={`/timesheets/${dashboard.currentTimesheet.id}`}>
              <Button>Open current month</Button>
            </Link>
            <Link href={`/timesheets/${dashboard.previousTimesheet.id}`}>
              <Button variant="secondary">Open previous month</Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
                Current month progress
              </p>
              <p className="mt-2 text-3xl font-semibold text-stone-950">
                {dashboard.currentTimesheet.totalHours} / {dashboard.currentTimesheet.assignedHours} hours
              </p>
            </div>
            <Badge tone={dashboard.currentTimesheet.status}>
              {dashboard.currentTimesheet.status.replaceAll("_", " ")}
            </Badge>
          </div>
          <ProgressBar
            value={dashboard.currentTimesheet.completionPercentage}
            label={`${dashboard.currentTimesheet.completionPercentage}% complete`}
          />
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
            Previous month status
          </p>
          <Badge tone={dashboard.previousTimesheet.status}>
            {dashboard.previousTimesheet.status.replaceAll("_", " ")}
          </Badge>
          <p className="text-sm text-stone-600">
            Completion: {dashboard.previousTimesheet.completionPercentage}% | Remaining:{" "}
            {dashboard.previousTimesheet.remainingHours} hours
          </p>
          <Link href={`/timesheets/${dashboard.previousTimesheet.id}`}>
            <Button variant="secondary">View previous month</Button>
          </Link>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
            Upcoming deadlines and reminders
          </p>
          {dashboard.upcomingDeadlines.map((deadline) => (
            <div
              key={deadline.label}
              className="rounded-[22px] bg-stone-50 px-4 py-4 text-sm"
            >
              <p className="font-semibold text-stone-900">{deadline.label}</p>
              <p className="mt-1 text-stone-600">{deadline.date}</p>
            </div>
          ))}
        </Card>
        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
            Project allocation breakdown
          </p>
          <PieChart data={dashboard.allocationBreakdown} />
        </Card>
      </div>

      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
          Historical submission record
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.history.map((item) => (
            <Link
              key={item.id}
              href={`/timesheets/${item.id}`}
              className="rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-4 transition hover:border-teal-300 hover:bg-white"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-stone-900">{item.monthLabel}</p>
                <Badge tone={item.status}>{item.status.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-sm text-stone-600">
                Completion: {item.completionPercentage}%
              </p>
              {item.submittedAt ? (
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-stone-500">
                  Submitted {formatDisplayDate(item.submittedAt)}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      </Card>
    </PortalShell>
  );
}
