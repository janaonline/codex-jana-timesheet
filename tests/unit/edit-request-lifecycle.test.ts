import { canEditTimesheet, canRequestEdit } from "@/lib/workflow-rules";

describe("edit request lifecycle", () => {
  it("allows a fresh request after rejection for the previous month", () => {
    expect(
      canRequestEdit({
        status: "REJECTED",
        monthKey: "2026-02",
        reference: new Date("2026-03-15T12:00:00+05:30"),
      }),
    ).toBe(true);
  });

  it("keeps Edit Approved distinct from Draft and editable only within its window", () => {
    expect(
      canEditTimesheet({
        status: "EDIT_APPROVED",
        monthKey: "2026-02",
        reference: new Date("2026-03-16T12:00:00+05:30"),
        editWindowClosesAt: new Date("2026-03-17T23:59:59+05:30"),
      }),
    ).toBe(true);

    expect(
      canEditTimesheet({
        status: "DRAFT",
        monthKey: "2026-02",
        reference: new Date("2026-03-16T12:00:00+05:30"),
      }),
    ).toBe(false);
  });
});
