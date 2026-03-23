# Pending External Inputs / TODO Placeholders

These items were explicitly left as TODOs because the requirements mark them as pending external inputs:

1. Employee master data source
- Current implementation uses Azure-profile sync plus local seed/upsert into `User`.
- Final integration source is still pending.

2. Manager hierarchy source
- No separate manager hierarchy integration was invented.
- Current approver mapping is stored internally on the `User` record and editable from the admin dashboard.

3. Project / sub-program list update mechanism
- The MVP ships with seeded `Project` records.
- Final operations-owned format and update process are still pending.

4. Final email templates and subject lines
- Placeholder HTML templates are implemented in [emails/templates.ts](/d:/projects/codex-jana-timesheet/.git/codex-jana-timesheet/emails/templates.ts).
- Stakeholder-owned copy must replace the placeholder subjects and guidance text.

5. Edit-window counting confirmation
- Current implementation counts the next three working days after approval.
- Business confirmation is still recommended because the source does not define whether the approval day counts.
