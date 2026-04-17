export const GLOBAL_LOADER_TIMINGS = {
  showDelayMs: 150,
  minVisibleMs: 350,
  routeGuardMs: 30_000,
} as const;

export type GlobalLoaderMode = "blocking" | "non-blocking";

export type GlobalLoaderSource = "mutation" | "route" | "form";

export type GlobalLoaderRequest = {
  token: string;
  mode: GlobalLoaderMode;
  source: GlobalLoaderSource;
  startedAt: number;
  message?: string;
};

export function selectDominantLoaderRequest(
  requests: GlobalLoaderRequest[],
) {
  if (!requests.length) {
    return null;
  }

  const sortedRequests = [...requests].sort(
    (left, right) => left.startedAt - right.startedAt,
  );
  const blockingRequests = sortedRequests.filter(
    (request) => request.mode === "blocking",
  );

  if (blockingRequests.length > 0) {
    return blockingRequests[blockingRequests.length - 1];
  }

  return sortedRequests[sortedRequests.length - 1];
}

export function getLoaderMessage(request?: Pick<GlobalLoaderRequest, "message"> | null) {
  return request?.message?.trim() || "Please wait...";
}

export function getHideDelayMs(
  visibleSince: number | null,
  now = Date.now(),
) {
  if (visibleSince === null) {
    return 0;
  }

  return Math.max(
    0,
    GLOBAL_LOADER_TIMINGS.minVisibleMs - (now - visibleSince),
  );
}
