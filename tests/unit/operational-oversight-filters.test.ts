import { getOperationalOversightNextLocation } from "@/lib/operational-oversight-filters";

describe("OperationalOversightFilters", () => {
  it("returns null for a no-op month selection", () => {
    expect(
      getOperationalOversightNextLocation({
        pathname: "/admin",
        currentSearch: "oversightMonthKey=2026-04",
        selectedMonthKey: "2026-04",
        selectedEditRequestStatus: "ALL",
        next: {
          monthKey: "2026-04",
        },
      }),
    ).toBeNull();
  });

  it("returns the next URL for a real month filter change", () => {
    expect(
      getOperationalOversightNextLocation({
        pathname: "/admin",
        currentSearch: "",
        selectedMonthKey: null,
        selectedEditRequestStatus: "ALL",
        next: {
          monthKey: "2026-04",
        },
      }),
    ).toBe("/admin?oversightMonthKey=2026-04");
  });
});
