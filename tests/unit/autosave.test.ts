import { saveWithRetry } from "@/hooks/use-autosave";

describe("auto-save retry behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("retries failed saves and eventually succeeds", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce("saved");

    const promise = saveWithRetry(operation, [100, 200, 300]);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(300);

    await expect(promise).resolves.toBe("saved");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new Error("network"));

    const promise = saveWithRetry(operation, [100, 200, 300]);
    const assertion = expect(promise).rejects.toThrow("network");

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(300);

    await assertion;
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
