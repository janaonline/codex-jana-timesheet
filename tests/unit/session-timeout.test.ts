import { isSessionExpired } from "@/lib/session-timeout";

describe("session timeout behavior", () => {
  it("expires inactive sessions after the configured timeout", () => {
    const lastActivityAt = new Date("2026-03-23T10:00:00+05:30").getTime();
    const now = new Date("2026-03-23T10:31:00+05:30").getTime();

    expect(
      isSessionExpired({
        lastActivityAt,
        timeoutMinutes: 30,
        now,
      }),
    ).toBe(true);
  });

  it("keeps active sessions valid within the timeout window", () => {
    const lastActivityAt = new Date("2026-03-23T10:00:00+05:30").getTime();
    const now = new Date("2026-03-23T10:20:00+05:30").getTime();

    expect(
      isSessionExpired({
        lastActivityAt,
        timeoutMinutes: 30,
        now,
      }),
    ).toBe(false);
  });
});
