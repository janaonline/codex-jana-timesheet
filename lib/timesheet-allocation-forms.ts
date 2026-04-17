export type WeekAllocationFormState = {
  id: string;
  weekStartDate: string;
  projectId: string;
  totalHours: string;
  description: string;
};

export type MonthAllocationFormState = {
  id: string;
  projectId: string;
  totalHours: string;
  description: string;
};

export function createWeekAllocationForm(
  id: string,
  defaultProjectId: string,
): WeekAllocationFormState {
  return {
    id,
    weekStartDate: "",
    projectId: defaultProjectId,
    totalHours: "",
    description: "",
  };
}

export function createMonthAllocationForm(
  id: string,
  defaultProjectId: string,
): MonthAllocationFormState {
  return {
    id,
    projectId: defaultProjectId,
    totalHours: "",
    description: "",
  };
}

export function appendAllocationForm<T>(forms: T[], nextForm: T) {
  return [...forms, nextForm];
}

export function removeAllocationForm<T extends { id: string }>(
  forms: T[],
  formId: string,
) {
  return forms.filter((form) => form.id !== formId);
}
