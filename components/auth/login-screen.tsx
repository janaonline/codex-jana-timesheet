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

  const loginBgStyles = `
    @keyframes login-float-up {
      0%   { transform: translateY(0) rotate(var(--r0)); opacity: 0; }
      8%   { opacity: 1; }
      90%  { opacity: 0.85; }
      100% { transform: translateY(-110vh) rotate(var(--r1)); opacity: 0; }
    }
    @keyframes login-float-diagonal {
      0%   { transform: translate(0, 0) rotate(var(--r0)); opacity: 0; }
      8%   { opacity: 1; }
      90%  { opacity: 0.75; }
      100% { transform: translate(var(--dx, 0px), -105vh) rotate(var(--r1)); opacity: 0; }
    }
    @keyframes login-float-sway {
      0%   { transform: translateY(0) translateX(0) rotate(var(--r0)); opacity: 0; }
      25%  { transform: translateY(-25vh) translateX(var(--sx, 0px)) rotate(var(--r-mid, 0deg)); opacity: 1; }
      75%  { transform: translateY(-75vh) translateX(calc(var(--sx, 0px) * -0.5)) rotate(var(--r-mid, 0deg)); opacity: 0.8; }
      100% { transform: translateY(-108vh) translateX(0) rotate(var(--r1)); opacity: 0; }
    }
    .login-bg-shape {
      position: absolute;
      border-radius: 4px;
      border: 1px solid var(--color-border);
    }
    @media (prefers-reduced-motion: reduce) {
      .login-bg-shape { animation: none !important; opacity: 0 !important; }
    }
  `;

  return (
    <main className="relative min-h-screen overflow-hidden bg-(--color-bg) px-4 py-8 text-(--color-text) sm:px-6 lg:px-8">
      {/* Theme toggle — fixed top-right, visible on all login views */}
      <ThemeToggle className="fixed right-4 top-4 z-10" />

      {/* ── Login background animation ─────────────────────────────
          Pure CSS floating geometry. Uses --color-border and
          --color-surface-raised tokens so it adapts to dark/light
          automatically. Amber fills use rgba on the amber-300 hex
          which stays constant in both themes (per globals.css).
          aria-hidden — decorative only.
      ─────────────────────────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: loginBgStyles }} />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {/* Radial vignette — clears the centre for the login card */}
        <div
          className="absolute inset-0 z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 65% at 50% 50%, transparent 30%, color-mix(in srgb, var(--color-bg) 96%, transparent) 100%)",
          }}
        />

        <div className="login-bg-shape" style={{ width:160, height:90,
          background:"var(--color-surface-raised)", left:"6%", bottom:-100,
          ["--r0" as string]:"-4deg", ["--r1" as string]:"6deg", ["--sx" as string]:"30px",
          animation:"login-float-sway 22s ease-in-out infinite 0s" }} />

        <div className="login-bg-shape" style={{ width:48, height:140,
          background:"rgba(252,211,77,0.14)", left:"15%", bottom:-160,
          ["--r0" as string]:"2deg", ["--r1" as string]:"-5deg",
          animation:"login-float-up 26s linear infinite -8s" }} />

        <div className="login-bg-shape" style={{ width:36, height:36,
          background:"var(--color-surface-raised)", left:"22%", bottom:-50,
          ["--r0" as string]:"8deg", ["--r1" as string]:"-8deg", ["--sx" as string]:"-20px",
          animation:"login-float-sway 18s ease-in-out infinite -4s" }} />

        <div className="login-bg-shape" style={{ width:110, height:64,
          background:"rgba(252,211,77,0.14)", left:"30%", bottom:-80,
          ["--r0" as string]:"-2deg", ["--r1" as string]:"4deg", ["--dx" as string]:"-18px",
          animation:"login-float-diagonal 24s ease-in-out infinite -11s" }} />

        <div className="login-bg-shape" style={{ width:200, height:40,
          background:"var(--color-surface-raised)", left:"40%", bottom:-60,
          ["--r0" as string]:"1deg", ["--r1" as string]:"-3deg",
          animation:"login-float-up 30s linear infinite -18s" }} />

        <div className="login-bg-shape" style={{ width:44, height:44,
          background:"rgba(252,211,77,0.14)", right:"34%", bottom:-60,
          ["--r0" as string]:"-6deg", ["--r1" as string]:"10deg", ["--dx" as string]:"20px",
          animation:"login-float-diagonal 20s ease-in-out infinite -6s" }} />

        <div className="login-bg-shape" style={{ width:80, height:120,
          background:"var(--color-surface-raised)", right:"22%", bottom:-140,
          ["--r0" as string]:"3deg", ["--r1" as string]:"-6deg", ["--sx" as string]:"25px",
          animation:"login-float-sway 28s ease-in-out infinite -14s" }} />

        <div className="login-bg-shape" style={{ width:140, height:52,
          background:"rgba(252,211,77,0.14)", right:"10%", bottom:-70,
          ["--r0" as string]:"-3deg", ["--r1" as string]:"5deg",
          animation:"login-float-up 23s linear infinite -2s" }} />

        <div className="login-bg-shape" style={{ width:40, height:160,
          background:"var(--color-surface-raised)", right:"4%", bottom:-180,
          ["--r0" as string]:"5deg", ["--r1" as string]:"-4deg", ["--dx" as string]:"-10px",
          animation:"login-float-diagonal 32s ease-in-out infinite -20s" }} />

        <div className="login-bg-shape" style={{ width:24, height:24,
          background:"rgba(252,211,77,0.14)", left:"8%", bottom:-30,
          ["--r0" as string]:"12deg", ["--r1" as string]:"-12deg", ["--sx" as string]:"15px",
          animation:"login-float-sway 16s ease-in-out infinite -9s" }} />

        <div className="login-bg-shape" style={{ width:28, height:28,
          background:"var(--color-surface-raised)", right:"14%", bottom:-40,
          ["--r0" as string]:"-8deg", ["--r1" as string]:"8deg", ["--sx" as string]:"-18px",
          animation:"login-float-sway 19s ease-in-out infinite -3s" }} />

        <div className="login-bg-shape" style={{ width:120, height:70,
          background:"var(--color-surface-raised)", left:"3%", bottom:-90,
          ["--r0" as string]:"4deg", ["--r1" as string]:"-7deg",
          animation:"login-float-up 34s linear infinite -25s" }} />

        <div className="login-bg-shape" style={{ width:56, height:88,
          background:"rgba(252,211,77,0.14)", right:"28%", bottom:-100,
          ["--r0" as string]:"-5deg", ["--r1" as string]:"5deg", ["--dx" as string]:"12px",
          animation:"login-float-diagonal 27s ease-in-out infinite -16s" }} />
      </div>

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

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
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
