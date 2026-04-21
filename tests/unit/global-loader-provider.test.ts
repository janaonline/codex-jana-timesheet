import {
  buildRouteLocationKey,
  completeRouteTransitionRequests,
  type GlobalLoaderRequest,
} from "@/lib/global-loader-state";

function buildRequest(
  overrides: Partial<GlobalLoaderRequest>,
): GlobalLoaderRequest {
  return {
    token: overrides.token ?? crypto.randomUUID(),
    mode: overrides.mode ?? "non-blocking",
    source: overrides.source ?? "mutation",
    startedAt: overrides.startedAt ?? 0,
    message: overrides.message,
  };
}

describe("Global loader route transition cleanup", () => {
  it("treats a query-only admin navigation as a completed route transition", () => {
    const currentLocation = buildRouteLocationKey("/admin");
    const nextLocation = buildRouteLocationKey(
      "/admin",
      "oversightMonthKey=2026-04",
    );

    expect(nextLocation).not.toBe(currentLocation);
    expect(
      completeRouteTransitionRequests([
        buildRequest({
          token: "route-request",
          mode: "blocking",
          source: "route",
          message: "Refreshing oversight metrics...",
        }),
        buildRequest({
          token: "mutation-request",
          mode: "non-blocking",
          source: "mutation",
          message: "Saving draft...",
        }),
      ]),
    ).toMatchObject([
      {
        token: "mutation-request",
        source: "mutation",
        message: "Saving draft...",
      },
    ]);
  });
});
