import {
  assertPermission,
  getPermissionsForRole,
  hasPermission,
} from "@/lib/rbac";

describe("RBAC enforcement", () => {
  it("grants program-head timesheet permissions only", () => {
    expect(hasPermission("PROGRAM_HEAD", "timesheets:write:self")).toBe(true);
    expect(hasPermission("PROGRAM_HEAD", "reports:read:admin")).toBe(false);
  });

  it("centralizes default permissions with safe approval defaults", () => {
    expect(getPermissionsForRole("ADMIN")).toContain("edit-requests:review");
    expect(getPermissionsForRole("OPERATIONS")).not.toContain(
      "edit-requests:review",
    );
  });

  it("allows explicit permission overrides when configured", () => {
    expect(
      hasPermission("OPERATIONS", "edit-requests:review", {
        PROGRAM_HEAD: [
          "timesheets:read:self",
          "timesheets:write:self",
          "timesheets:submit:self",
          "timesheets:request-edit:self",
        ],
        ADMIN: [
          "timesheets:read:self",
          "reports:read:admin",
          "reports:export:admin",
          "edit-requests:review",
          "jobs:run",
          "configuration:manage",
        ],
        OPERATIONS: [
          "timesheets:read:self",
          "reports:read:admin",
          "reports:export:admin",
          "jobs:run",
          "edit-requests:review",
        ],
      }),
    ).toBe(true);
  });

  it("throws for forbidden admin-only actions", () => {
    expect(() =>
      assertPermission("PROGRAM_HEAD", "edit-requests:review"),
    ).toThrow("You do not have permission to perform this action.");
  });
});
