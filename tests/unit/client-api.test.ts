import {
  ApiClientError,
  handleUnauthorizedApiClientError,
} from "@/lib/client-api";

describe("client API authentication handling", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("redirects expired sessions to the login page with the session-expired reason", () => {
    const replace = vi.fn();
    (globalThis as { window?: unknown }).window = {
      location: { replace },
    };

    const handled = handleUnauthorizedApiClientError(
      new ApiClientError("Authentication is required.", "UNAUTHORIZED"),
    );

    expect(handled).toBe(true);
    expect(replace).toHaveBeenCalledWith("/login?reason=session-expired");
  });

  it("ignores non-authentication client errors", () => {
    const replace = vi.fn();
    (globalThis as { window?: unknown }).window = {
      location: { replace },
    };

    const handled = handleUnauthorizedApiClientError(
      new ApiClientError("Forbidden.", "FORBIDDEN"),
    );

    expect(handled).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
