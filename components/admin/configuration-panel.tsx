import { Card } from "@/components/common/card";
import { Button } from "@/components/common/button";
import { GlobalLoaderFormStatus } from "@/components/common/global-loader-form-status";
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
        <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
          System configuration
        </p>
        <form action={onConfigSubmit} className="space-y-4">
          <GlobalLoaderFormStatus
            message="Saving configuration..."
          />
          <input name="autoSubmitDay" defaultValue={config.autoSubmitDay} hidden readOnly />
          <input
            name="completionThreshold"
            defaultValue={config.completionThreshold}
            hidden
            readOnly
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[28px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-text-muted)">
                Fixed auto-submit day
              </p>
              <p className="mt-3 text-2xl font-semibold text-(--color-text)">
                {config.autoSubmitDay}th
              </p>
              <p className="mt-2 leading-6 text-(--color-text-muted)">
                Reserved by the approved workflow. This remains fixed at the 25th day,
                12:00 AM IST.
              </p>
            </div>
            <div className="rounded-[28px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-text-muted)">
                Exact completion rule
              </p>
              <p className="mt-3 text-2xl font-semibold text-(--color-text)">
                {config.completionThreshold}%
              </p>
              <p className="mt-2 leading-6 text-(--color-text-muted)">
                Reserved by the approved workflow. Submission still requires exact
                completion.
              </p>
            </div>
            <label className="text-sm text-(--color-text-subtle)">
              Inactivity timeout (minutes)
              <input
                className="mt-2 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
                name="inactivityTimeoutMins"
                defaultValue={config.inactivityTimeoutMins}
                type="number"
                min={5}
              />
            </label>
            <label className="text-sm text-(--color-text-subtle)">
              Support contact email
              <input
                className="mt-2 w-full rounded-2xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
                name="supportContactEmail"
                defaultValue={config.supportContactEmail}
                type="email"
              />
            </label>
            <label className="text-sm text-(--color-text-subtle)">
              Current-month reminder days
              <input
                className="mt-2 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
                name="currentMonthDraftDays"
                defaultValue={config.reminderDays.currentMonthDraftDays.join(",")}
              />
            </label>
            <label className="text-sm text-(--color-text-subtle)">
              Next-month reminder days
              <input
                className="mt-2 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
                name="nextMonthPendingDays"
                defaultValue={config.reminderDays.nextMonthPendingDays.join(",")}
              />
              <span className="mt-2 block text-xs leading-5 text-(--color-text-muted)">
                The 25th-day auto-submit run remains fixed by workflow and is not managed
                here.
              </span>
            </label>
          </div>
          <label className="block text-sm text-(--color-text-subtle)">
            Holiday calendar (comma-separated YYYY-MM-DD)
            <textarea
              className="mt-2 min-h-28 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
              name="holidayCalendar"
              defaultValue={config.holidayCalendar.join(",")}
            />
          </label>
          <label className="block text-sm text-(--color-text-subtle)">
            Role access controls (JSON)
            <textarea
              className="mt-2 min-h-40 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 font-mono text-xs text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
              name="roleAccess"
              defaultValue={JSON.stringify(config.roleAccess, null, 2)}
            />
            <span className="mt-2 block text-xs leading-5 text-(--color-text-muted)">
              Use this only for controlled permission overrides. Safe defaults remain in
              place even when this field is empty.
            </span>
          </label>
          <label className="flex items-center gap-3 text-sm text-(--color-text-subtle)">
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
        <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">
          Approver mapping
        </p>
        <form action={onApproverSubmit} className="space-y-4">
          <GlobalLoaderFormStatus
            message="Saving approver mapping..."
          />
          {programHeads.map((user) => (
            <label
              key={user.id}
              className="block rounded-[22px] bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)"
            >
              <span className="font-semibold text-(--color-text)">{user.name}</span>
              <span className="block text-xs uppercase tracking-[0.18em] text-(--color-text-muted)">
                {user.email}
              </span>
              <select
                className="mt-3 w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary-ring) focus:border-(--color-primary)"
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
