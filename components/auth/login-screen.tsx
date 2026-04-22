"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, signOut } from "next-auth/react";

import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { useGlobalLoader } from "@/components/common/global-loader-provider";
import { Input } from "@/components/common/input";
import { Modal } from "@/components/common/modal";
import { ThemeToggle } from "@/components/common/theme-toggle";
import {
  OTP_AUTH_PROVIDER_ID,
  PASSWORD_AUTH_PROVIDER_ID,
  type OtpPurpose,
} from "@/lib/constants";

type AuthView = "login" | "activate" | "forgot" | "verify-otp";

type OtpResponse = {
  message: string;
  destinationHint: string;
  expiresInMinutes: number;
  sent: boolean;
  cooldownSeconds: number;
};

function mapAuthError(error: string | undefined, fallback: string) {
  switch (error) {
    case "PASSWORD_SETUP_REQUIRED":
      return "Finish activation or reset your password before signing in.";
    case "INVALID_CREDENTIALS":
    case "CredentialsSignin":
      return "Invalid email or password.";
    case "OTP_EXPIRED":
      return "This code has expired. Request a new one to continue.";
    case "OTP_ALREADY_USED":
      return "This code has already been used. Request a new one to continue.";
    case "OTP_ATTEMPTS_EXCEEDED":
      return "Too many incorrect attempts. Request a new code to continue.";
    case "OTP_INVALID":
      return "The code you entered is incorrect.";
    default:
      return fallback;
  }
}

function getOtpHeading(purpose: OtpPurpose) {
  if (purpose === "FORGOT_PASSWORD") {
    return {
      title: "Check your email",
      description: "Enter the one-time code we sent so you can create a new password.",
    };
  }

  return {
    title: "Enter your activation code",
    description: "Use the emailed code to confirm your identity and continue.",
  };
}

export function LoginScreen({
  defaultView = "login",
  sessionExpired = false,
}: {
  defaultView?: Exclude<AuthView, "verify-otp">;
  sessionExpired?: boolean;
}) {
  const [view, setView] = useState<AuthView>(defaultView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>("FIRST_LOGIN");
  const [otpMeta, setOtpMeta] = useState<OtpResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(sessionExpired);
  const [logoutPending, setLogoutPending] = useState(false);
  const { runWithLoader } = useGlobalLoader();

  useEffect(() => {
    setSessionExpiredOpen(sessionExpired);
  }, [sessionExpired]);

  useEffect(() => {
    if (view !== "verify-otp" || cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [view, cooldownSeconds]);

  const otpHeading = useMemo(() => getOtpHeading(otpPurpose), [otpPurpose]);

  function replaceLocation(url: string) {
    window.location.replace(url);
  }

  async function handleExpiredSessionLogout() {
    setLogoutPending(true);

    try {
      const result = await runWithLoader({
        mode: "blocking",
        message: "Signing out...",
        operation: () =>
          signOut({
            callbackUrl: "/login",
            redirect: false,
          }),
      });

      setSessionExpiredOpen(false);
      replaceLocation(result?.url ?? "/login");
    } finally {
      setLogoutPending(false);
    }
  }

  async function requestOtp(purpose: OtpPurpose) {
    setPending(true);
    setError(null);

    try {
      const response = await runWithLoader({
        mode: "non-blocking",
        message:
          purpose === "FORGOT_PASSWORD"
            ? "Sending reset code..."
            : "Sending activation code...",
        operation: () =>
          fetch("/api/v1/auth/request-otp", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              email,
              purpose,
            }),
          }),
      });

      const payload = (await response.json()) as
        | { ok: true; data: OtpResponse }
        | { ok: false; error: { message: string } };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "Unable to send the one-time code." : payload.error.message,
        );
      }

      setOtpPurpose(purpose);
      setOtpMeta(payload.data);
      setCooldownSeconds(payload.data.cooldownSeconds);
      setOtpCode("");
      setView("verify-otp");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to send the one-time code.",
      );
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await runWithLoader({
      mode: "blocking",
      message: "Signing in...",
      operation: () =>
        signIn(PASSWORD_AUTH_PROVIDER_ID, {
          email,
          password,
          callbackUrl: "/",
          redirect: false,
        }),
    });

    if (result?.error) {
      setError(mapAuthError(result.error, "Unable to sign in right now."));
      setPending(false);
      return;
    }

    replaceLocation(result?.url ?? "/");
  }

  async function handleOtpVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await runWithLoader({
      mode: "blocking",
      message: "Verifying code...",
      operation: () =>
        signIn(OTP_AUTH_PROVIDER_ID, {
          email,
          code: otpCode,
          purpose: otpPurpose,
          callbackUrl: "/auth/set-password",
          redirect: false,
        }),
    });

    if (result?.error) {
      setError(mapAuthError(result.error, "Unable to verify the code right now."));
      setPending(false);
      return;
    }

    replaceLocation(result?.url ?? "/auth/set-password");
  }

  return (
    <main className="relative min-h-screen bg-(--color-bg) px-4 py-8 text-(--color-text) sm:px-6 lg:px-8">
      {/* Theme toggle — fixed top-right, visible on all login views */}
      <ThemeToggle className="fixed right-4 top-4 z-10" />

      <Modal
        open={sessionExpiredOpen}
        title="Session expired"
        onClose={() => undefined}
        hideCloseButton
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-(--color-text-muted)">
            Your session has expired due to inactivity. Log out to clear the expired
            session and return to the sign-in screen.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => void handleExpiredSessionLogout()} disabled={logoutPending}>
              {logoutPending ? "Logging out..." : "Log out"}
            </Button>
          </div>
        </div>
      </Modal>

      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex rounded-full border border-(--color-border) bg-(--color-surface-raised) px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-(--color-text-subtle)">
            Janaagraha internal portal
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-(--color-text) sm:text-5xl">
              Directors Timesheet Management System
            </h1>
            <p className="max-w-2xl text-base leading-7 text-(--color-text-muted) sm:text-lg">
              Monthly timesheets, reminders, controlled edit requests, and reporting in
              one clear workflow built for internal teams.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              "Email and password sign-in",
              "OTP-based activation and reset",
              "Responsive workflow for mobile and desktop",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-(--color-border) bg-(--color-surface-raised) px-5 py-5 text-sm leading-6 text-(--color-text-subtle)"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="rounded-[32px] border-(--color-border) bg-(--color-surface) p-6 sm:p-8">
          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { key: "login", label: "Sign in" },
              { key: "activate", label: "First-time access" },
              { key: "forgot", label: "Forgot password" },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  view === item.key
                    ? "bg-(--color-primary) text-stone-950"
                    : "bg-(--color-surface-raised) text-(--color-text-muted) hover:bg-(--color-border)"
                }`}
                onClick={() => {
                  setError(null);
                  setView(item.key as AuthView);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {view === "login" ? (
            <form className="space-y-4" onSubmit={handlePasswordSignIn}>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-(--color-text)">Sign in</h2>
                <p className="text-sm leading-6 text-(--color-text-muted)">
                  Use your Janaagraha email address and password to continue.
                </p>
              </div>
              <label className="block text-sm font-medium text-(--color-text-subtle)">
                Email
                <Input
                  className="mt-2"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="name@janaagraha.org"
                  required
                />
              </label>
              <label className="block text-sm font-medium text-(--color-text-subtle)">
                Password
                <Input
                  className="mt-2"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
              </label>
              {error ? (
                <p className="rounded-2xl border border-(--color-error-border) bg-(--color-error-bg) px-4 py-3 text-sm text-(--color-error-text)">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending}>
                {pending ? "Signing in..." : "Sign in"}
              </Button>
              <div className="flex flex-col gap-3 text-sm text-(--color-text-muted) sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="text-left font-medium text-(--color-text) underline underline-offset-4"
                  onClick={() => {
                    setError(null);
                    setView("forgot");
                  }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="text-left font-medium text-(--color-text) underline underline-offset-4"
                  onClick={() => {
                    setError(null);
                    setView("activate");
                  }}
                >
                  First-time access
                </button>
              </div>
            </form>
          ) : null}

          {view === "activate" || view === "forgot" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void requestOtp(view === "forgot" ? "FORGOT_PASSWORD" : "FIRST_LOGIN");
              }}
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-(--color-text)">
                  {view === "forgot" ? "Reset your password" : "Activate your access"}
                </h2>
                <p className="text-sm leading-6 text-(--color-text-muted)">
                  {view === "forgot"
                    ? "Enter your work email and we'll send a one-time code so you can create a new password."
                    : "Enter your work email and we'll send a one-time code to help you create your password."}
                </p>
              </div>
              <label className="block text-sm font-medium text-(--color-text-subtle)">
                Work email
                <Input
                  className="mt-2"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  placeholder="name@janaagraha.org"
                  required
                />
              </label>
              {error ? (
                <p className="rounded-2xl border border-(--color-error-border) bg-(--color-error-bg) px-4 py-3 text-sm text-(--color-error-text)">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending}>
                {pending ? "Sending code..." : "Send one-time code"}
              </Button>
              <button
                type="button"
                className="text-sm font-medium text-(--color-text-subtle) underline underline-offset-4"
                onClick={() => {
                  setError(null);
                  setView("login");
                }}
              >
                Back to sign in
              </button>
            </form>
          ) : null}

          {view === "verify-otp" ? (
            <form className="space-y-4" onSubmit={handleOtpVerification}>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-(--color-text)">
                  {otpHeading.title}
                </h2>
                <p className="text-sm leading-6 text-(--color-text-muted)">
                  {otpHeading.description}
                </p>
              </div>
              {otpMeta ? (
                <div className="rounded-2xl border border-(--color-border) bg-(--color-surface-raised) px-4 py-4 text-sm text-(--color-text-subtle)">
                  <p>{otpMeta.message}</p>
                  <p className="mt-1 font-medium text-(--color-text)">
                    Destination: {otpMeta.destinationHint}
                  </p>
                  <p className="mt-1 text-(--color-text-muted)">
                    The code expires in {otpMeta.expiresInMinutes} minutes.
                  </p>
                </div>
              ) : null}
              <label className="block text-sm font-medium text-(--color-text-subtle)">
                One-time code
                <Input
                  className="mt-2 text-center text-lg tracking-[0.36em]"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  onChange={(event) =>
                    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  required
                />
              </label>
              {error ? (
                <p className="rounded-2xl border border-(--color-error-border) bg-(--color-error-bg) px-4 py-3 text-sm text-(--color-error-text)">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending || otpCode.length !== 6}>
                {pending ? "Verifying..." : "Verify code"}
              </Button>
              <div className="flex flex-col gap-3 text-sm text-(--color-text-muted) sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="font-medium text-(--color-text) underline underline-offset-4 disabled:text-(--color-text-placeholder)"
                  onClick={() => {
                    void requestOtp(otpPurpose);
                  }}
                  disabled={pending || cooldownSeconds > 0}
                >
                  {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  className="font-medium text-(--color-text-subtle) underline underline-offset-4"
                  onClick={() => {
                    setError(null);
                    setView(otpPurpose === "FORGOT_PASSWORD" ? "forgot" : "activate");
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
