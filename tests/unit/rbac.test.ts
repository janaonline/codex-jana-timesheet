import { assertPermission, hasPermission } from "@/lib/rbac";

describe("RBAC enforcement", () => {
  it("grants program-head timesheet permissions only", () => {
    expect(hasPermission("PROGRAM_HEAD", "timesheets:write:self")).toBe(true);
    expect(hasPermission("PROGRAM_HEAD", "reports:read:admin")).toBe(false);
  });

  it("throws for forbidden admin-only actions", () => {
    expect(() =>
      assertPermission("PROGRAM_HEAD", "edit-requests:review"),
    ).toThrow("You do not have permission to perform this action.");
  });
});
