import { redirect } from "next/navigation";

import { requireAppSession } from "@/lib/auth";
import { isTimesheetOwnerRole } from "@/lib/rbac";
import { createTimesheetForUser } from "@/services/timesheet-service";

export default async function TimesheetMonthPage({
  params,
}: {
  params: Promise<{ monthKey: string }>;
}) {
  const session = await requireAppSession();

  if (!isTimesheetOwnerRole(session.user.role)) {
    redirect("/admin");
  }

  const { monthKey } = await params;
  const timesheet = await createTimesheetForUser(session.user.id, monthKey);

  redirect(`/timesheets/${timesheet.id}`);
}
