import {
  appendAllocationForm,
  createMonthAllocationForm,
  createWeekAllocationForm,
  removeAllocationForm,
} from "@/lib/timesheet-allocation-forms";

describe("timesheet-allocation-forms", () => {
  it("creates a week allocation row with the existing defaults", () => {
    expect(createWeekAllocationForm("week-1", "project-1")).toEqual({
      id: "week-1",
      weekStartDate: "",
      projectId: "project-1",
      totalHours: "",
      description: "",
    });
  });

  it("creates a month allocation row with the existing defaults", () => {
    expect(createMonthAllocationForm("month-1", "project-2")).toEqual({
      id: "month-1",
      projectId: "project-2",
      totalHours: "",
      description: "",
    });
  });

  it("appends an added allocation row without mutating the original list", () => {
    const existingRows = [createMonthAllocationForm("month-1", "project-1")];
    const nextRow = createMonthAllocationForm("month-2", "project-2");

    const result = appendAllocationForm(existingRows, nextRow);

    expect(result).toEqual([existingRows[0], nextRow]);
    expect(existingRows).toEqual([createMonthAllocationForm("month-1", "project-1")]);
  });

  it("removes only the targeted allocation row", () => {
    const rows = [
      createWeekAllocationForm("week-1", "project-1"),
      createWeekAllocationForm("week-2", "project-2"),
      createWeekAllocationForm("week-3", "project-3"),
    ];

    expect(removeAllocationForm(rows, "week-2")).toEqual([rows[0], rows[2]]);
  });
});
