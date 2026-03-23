import {
  calculateAssignedHours,
  isExactCompletion,
  validateTimesheetInput,
} from "@/lib/timesheet-calculations";

describe("timesheet calculations", () => {
  it("calculates assigned hours from working days and leaves", () => {
    const result = calculateAssignedHours({
      monthKey: "2026-03",
      leaveDays: 2,
      joinDate: null,
      exitDate: null,
      holidays: [],
    });

    expect(result.workingDaysCount).toBe(22);
    expect(result.assignedHours).toBe(160);
  });

  it("treats 100% completion as exact assigned hours only", () => {
    expect(isExactCompletion(186, 186)).toBe(true);
    expect(isExactCompletion(185.75, 186)).toBe(false);
    expect(isExactCompletion(186.25, 186)).toBe(false);
  });

  it("prevents total recorded hours from exceeding assigned hours", () => {
    const validation = validateTimesheetInput({
      mode: "draft",
      leaveDays: 0,
      assignedHours: 8,
      entries: [
        {
          workDate: "2026-03-01",
          projectId: "project-1",
          hours: 8,
          description: "",
        },
        {
          workDate: "2026-03-02",
          projectId: "project-2",
          hours: 0.25,
          description: "",
        },
      ],
    });

    expect(validation.errors).toContain(
      "Total recorded hours cannot exceed assigned hours.",
    );
  });

  it("requires descriptions at submission time", () => {
    const validation = validateTimesheetInput({
      mode: "submit",
      leaveDays: 0,
      assignedHours: 8,
      entries: [
        {
          workDate: "2026-03-01",
          projectId: "project-1",
          hours: 8,
          description: "",
        },
      ],
    });

    expect(validation.errors).toContain(
      "Entry 1: description is required before submission.",
    );
  });
});
