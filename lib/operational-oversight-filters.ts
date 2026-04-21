import { type EditRequestMetricFilter } from "@/lib/constants";
import { buildRouteLocationKey } from "@/lib/global-loader-state";

export function getOperationalOversightNextLocation(params: {
  pathname: string;
  currentSearch: string;
  selectedMonthKey: string | null;
  selectedEditRequestStatus: EditRequestMetricFilter;
  next: {
    monthKey?: string | null;
    editRequestStatus?: EditRequestMetricFilter;
  };
}) {
  const searchParams = new URLSearchParams(params.currentSearch);
  const nextMonthKey =
    params.next.monthKey !== undefined
      ? params.next.monthKey
      : params.selectedMonthKey;
  const nextStatus =
    params.next.editRequestStatus !== undefined
      ? params.next.editRequestStatus
      : params.selectedEditRequestStatus;

  if (nextMonthKey) {
    searchParams.set("oversightMonthKey", nextMonthKey);
  } else {
    searchParams.delete("oversightMonthKey");
  }

  if (nextStatus === "ALL") {
    searchParams.delete("editRequestStatus");
  } else {
    searchParams.set("editRequestStatus", nextStatus);
  }

  const nextLocation = buildRouteLocationKey(
    params.pathname,
    searchParams.toString(),
  );
  const currentLocation = buildRouteLocationKey(
    params.pathname,
    params.currentSearch,
  );

  return nextLocation === currentLocation ? null : nextLocation;
}
