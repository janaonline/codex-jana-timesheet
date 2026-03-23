import { Card } from "@/components/common/card";
import { Button } from "@/components/common/button";
import type { SystemConfigurationView } from "@/services/configuration-service";

export function ConfigurationPanel({
  config,
  programHeads,
  approvers,
  onConfigSubmit,
  onApproverSubmit,
}: {
  config: SystemConfigurationView;
  programHeads: Array<{ id: string; name: string; email: string; approverUserId: string | null }>;
  approvers: Array<{ id: string; name: string; email: string }>;
  onConfigSubmit: (formData: FormData) => Promise<void>;
  onApproverSubmit: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
          System configuration
        </p>
        <form action={onConfigSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-stone-700">
              Auto-submit day
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="autoSubmitDay"
                defaultValue={config.autoSubmitDay}
                type="number"
                min={1}
                max={31}
              />
            </label>
            <label className="text-sm text-stone-700">
              Completion threshold
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="completionThreshold"
                defaultValue={config.completionThreshold}
                type="number"
                min={100}
                max={100}
              />
            </label>
            <label className="text-sm text-stone-700">
              Inactivity timeout (minutes)
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="inactivityTimeoutMins"
                defaultValue={config.inactivityTimeoutMins}
                type="number"
                min={5}
              />
            </label>
            <label className="text-sm text-stone-700">
              Support contact email
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="supportContactEmail"
                defaultValue={config.supportContactEmail}
                type="email"
              />
            </label>
            <label className="text-sm text-stone-700">
              Current-month reminder days
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="currentMonthDraftDays"
                defaultValue={config.reminderDays.currentMonthDraftDays.join(",")}
              />
            </label>
            <label className="text-sm text-stone-700">
              Next-month reminder days
              <input
                className="mt-2 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name="nextMonthPendingDays"
                defaultValue={config.reminderDays.nextMonthPendingDays.join(",")}
              />
            </label>
          </div>
          <label className="block text-sm text-stone-700">
            Holiday calendar (comma-separated YYYY-MM-DD)
            <textarea
              className="mt-2 min-h-28 w-full rounded-2xl border border-stone-300 px-4 py-3"
              name="holidayCalendar"
              defaultValue={config.holidayCalendar.join(",")}
            />
          </label>
          <label className="block text-sm text-stone-700">
            Email template placeholders (JSON)
            <textarea
              className="mt-2 min-h-40 w-full rounded-2xl border border-stone-300 px-4 py-3 font-mono text-xs"
              name="emailTemplates"
              defaultValue={JSON.stringify(config.emailTemplates, null, 2)}
            />
          </label>
          <label className="block text-sm text-stone-700">
            Role access controls (JSON)
            <textarea
              className="mt-2 min-h-40 w-full rounded-2xl border border-stone-300 px-4 py-3 font-mono text-xs"
              name="roleAccess"
              defaultValue={JSON.stringify(config.roleAccess, null, 2)}
            />
          </label>
          <label className="flex items-center gap-3 text-sm text-stone-700">
            <input
              type="checkbox"
              name="notifyAdminOnAutoSubmit"
              defaultChecked={config.notifyAdminOnAutoSubmit}
            />
            Notify admin users on eligible auto-submit
          </label>
          <Button type="submit">Save configuration</Button>
        </form>
      </Card>

      <Card className="space-y-4">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-500">
          Approver mapping
        </p>
        <form action={onApproverSubmit} className="space-y-4">
          {programHeads.map((user) => (
            <label
              key={user.id}
              className="block rounded-[22px] bg-stone-50 px-4 py-4 text-sm text-stone-700"
            >
              <span className="font-semibold text-stone-900">{user.name}</span>
              <span className="block text-xs uppercase tracking-[0.18em] text-stone-500">
                {user.email}
              </span>
              <select
                className="mt-3 w-full rounded-2xl border border-stone-300 px-4 py-3"
                name={`approver-${user.id}`}
                defaultValue={user.approverUserId ?? ""}
              >
                <option value="">Unassigned</option>
                {approvers.map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.name} ({approver.email})
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button type="submit">Save approver mapping</Button>
        </form>
      </Card>
    </div>
  );
}
