import { redirect } from "next/navigation";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { GlobalLoaderLink } from "@/components/common/global-loader-link";
import { PortalShell } from "@/components/common/portal-shell";
import { ProgressBar } from "@/components/common/progress-bar";
import { PieChart } from "@/components/dashboard/pie-chart";
import { HistoricalMonthPicker } from "@/components/timesheets/historical-month-picker";
import { requireAppSession } from "@/lib/auth";
import { isTimesheetOwnerRole } from "@/lib/rbac";
import { getDashboardData } from "@/services/timesheet-service";
import { formatDisplayDate } from "@/lib/time";

export default async function DashboardPage() {
  const session = await requireAppSession();

  if (!isTimesheetOwnerRole(session.user.role)) {
    redirect("/admin");
  }

  const dashboard = await getDashboardData(session.user.id);

  return (
    <PortalShell
      role={session.user.role}
      designation={session.user.designation}
      permissions={session.user.permissions}
      userName={session.user.name ?? session.user.email ?? "Director"}
      currentPath="/dashboard"
    >
      <Card className="space-y-5">
        <p className="text-xs uppercase tracking-[0.28em] text-(--color-text-muted)">
          Timesheet dashboard
        </p>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold text-(--color-text)">
              {dashboard.currentTimesheet.monthLabel}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-(--color-text-muted)">
              Track daily contributions, keep the active payroll period complete, and
              submit before the 25th cutoff if it is not eligible for auto-submit.
            </p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <GlobalLoaderLink
              href={`/timesheets/${dashboard.currentTimesheet.id}`}
              loaderMessage="Loading current timesheet..."
            >
              <Button className="w-full">Open current period</Button>
            </GlobalLoaderLink>
            <GlobalLoaderLink
              href={`/timesheets/${dashboard.previousTimesheet.id}`}
              loaderMessage="Loading previous timesheet..."
            >
              <Button className="w-full" variant="secondary">
                Open prior period
              </Button>
            </GlobalLoaderLink>
          </div>
        </div>
        <HistoricalMonthPicker
          defaultMonthKey={dashboard.previousTimesheet.monthKey}
          maxMonthKey={dashboard.currentTimesheet.monthKey}
        />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
                Current period progress
              </p>
              <p className="mt-2 text-3xl font-semibold text-(--color-text)">
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
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
            Prior period status
          </p>
          <Badge tone={dashboard.previousTimesheet.status}>
            {dashboard.previousTimesheet.status.replaceAll("_", " ")}
          </Badge>
          <p className="text-sm text-(--color-text-muted)">
            Completion: {dashboard.previousTimesheet.completionPercentage}% | Remaining:{" "}
            {dashboard.previousTimesheet.remainingHours} hours
          </p>
          <GlobalLoaderLink
            href={`/timesheets/${dashboard.previousTimesheet.id}`}
            loaderMessage="Loading previous timesheet..."
          >
            <Button variant="secondary">View prior period</Button>
          </GlobalLoaderLink>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
            Upcoming deadlines and reminders
          </p>
          {dashboard.upcomingDeadlines.map((deadline) => (
            <div
              key={deadline.label}
              className="rounded-[22px] bg-(--color-surface-raised) px-4 py-4 text-sm"
            >
              <p className="font-semibold text-(--color-text)">{deadline.label}</p>
              <p className="mt-1 text-(--color-text-muted)">{deadline.date}</p>
            </div>
          ))}
        </Card>
        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
            Project allocation breakdown
          </p>
          <PieChart data={dashboard.allocationBreakdown} />
        </Card>
      </div>

      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
          Historical submission record
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.history.map((item) => (
            <GlobalLoaderLink
              key={item.id}
              href={`/timesheets/${item.id}`}
              loaderMessage="Loading timesheet..."
              className="rounded-[22px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 transition hover:border-teal-300 hover:bg-(--color-surface)"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-(--color-text)">{item.monthLabel}</p>
                <Badge tone={item.status}>{item.status.replaceAll("_", " ")}</Badge>
              </div>
              <p className="mt-2 text-sm text-(--color-text-muted)">
                Completion: {item.completionPercentage}%
              </p>
              {item.submittedAt ? (
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-(--color-text-muted)">
                  Submitted {formatDisplayDate(item.submittedAt)}
                </p>
              ) : null}
            </GlobalLoaderLink>
          ))}
        </div>
      </Card>
    </PortalShell>
  );
}
