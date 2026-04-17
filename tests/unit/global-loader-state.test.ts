import {
  getHideDelayMs,
  getLoaderMessage,
  selectDominantLoaderRequest,
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

describe("global loader state", () => {
  it("prefers the newest blocking request over non-blocking requests", () => {
    expect(
      selectDominantLoaderRequest([
        buildRequest({
          token: "non-blocking-1",
          mode: "non-blocking",
          startedAt: 10,
        }),
        buildRequest({
          token: "blocking-1",
          mode: "blocking",
          startedAt: 20,
        }),
        buildRequest({
          token: "non-blocking-2",
          mode: "non-blocking",
          startedAt: 30,
        }),
      ]),
    ).toMatchObject({
      token: "blocking-1",
      mode: "blocking",
    });
  });

  it("uses the newest non-blocking request when no blocking work is active", () => {
    expect(
      selectDominantLoaderRequest([
        buildRequest({
          token: "non-blocking-1",
          mode: "non-blocking",
          startedAt: 10,
        }),
        buildRequest({
          token: "non-blocking-2",
          mode: "non-blocking",
          startedAt: 30,
        }),
      ]),
    ).toMatchObject({
      token: "non-blocking-2",
      mode: "non-blocking",
    });
  });

  it("returns the generic message when no custom message is supplied", () => {
    expect(getLoaderMessage()).toBe("Please wait...");
    expect(getLoaderMessage({ message: "  " })).toBe("Please wait...");
    expect(getLoaderMessage({ message: "Exporting report..." })).toBe(
      "Exporting report...",
    );
  });

  it("enforces the minimum visible duration before hiding", () => {
    expect(getHideDelayMs(null, 1_000)).toBe(0);
    expect(getHideDelayMs(1_000, 1_200)).toBe(150);
    expect(getHideDelayMs(1_000, 1_500)).toBe(0);
  });
});
