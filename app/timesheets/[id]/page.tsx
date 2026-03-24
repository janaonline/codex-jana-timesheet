import { PortalShell } from "@/components/common/portal-shell";
import { requireAppSession } from "@/lib/auth";
import { getTimesheetForActor } from "@/services/timesheet-service";
import { TimesheetEditor } from "@/components/timesheets/timesheet-editor";

export default async function TimesheetPage({
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
      currentPath={session.user.role === "PROGRAM_HEAD" ? "/dashboard" : "/admin/edit-requests"}
    >
      <TimesheetEditor
        initialTimesheet={data.timesheet}
        availableProjects={data.availableProjects}
        windowTimesheets={data.windowTimesheets}
      />
    </PortalShell>
  );
}
