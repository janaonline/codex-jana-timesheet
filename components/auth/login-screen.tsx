"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { Input } from "@/components/common/input";
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
}: {
  defaultView?: Exclude<AuthView, "verify-otp">;
}) {
  const router = useRouter();
  const [view, setView] = useState<AuthView>(defaultView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>("FIRST_LOGIN");
  const [otpMeta, setOtpMeta] = useState<OtpResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

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

  async function requestOtp(purpose: OtpPurpose) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          purpose,
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

    const result = await signIn(PASSWORD_AUTH_PROVIDER_ID, {
      email,
      password,
      callbackUrl: "/",
      redirect: false,
    });

    if (result?.error) {
      setError(mapAuthError(result.error, "Unable to sign in right now."));
      setPending(false);
      return;
    }

    router.replace(result?.url ?? "/");
    router.refresh();
  }

  async function handleOtpVerification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn(OTP_AUTH_PROVIDER_ID, {
      email,
      code: otpCode,
      purpose: otpPurpose,
      callbackUrl: "/auth/set-password",
      redirect: false,
    });

    if (result?.error) {
      setError(mapAuthError(result.error, "Unable to verify the code right now."));
      setPending(false);
      return;
    }

    router.replace(result?.url ?? "/auth/set-password");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-6xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-stone-700">
            Janaagraha internal portal
          </div>
          <div className="space-y-4">
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
              Directors Timesheet Management System
            </h1>
            <p className="max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
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
                className="rounded-3xl border border-stone-200 bg-stone-50 px-5 py-5 text-sm leading-6 text-stone-700"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <Card className="rounded-[32px] border-stone-200 bg-white p-6 sm:p-8">
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
                    ? "bg-amber-300 text-stone-950"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
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
                <h2 className="text-2xl font-semibold text-stone-950">Sign in</h2>
                <p className="text-sm leading-6 text-stone-600">
                  Use your Janaagraha email address and password to continue.
                </p>
              </div>
              <label className="block text-sm font-medium text-stone-700">
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
              <label className="block text-sm font-medium text-stone-700">
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
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending}>
                {pending ? "Signing in..." : "Sign in"}
              </Button>
              <div className="flex flex-col gap-3 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="text-left font-medium text-stone-900 underline underline-offset-4"
                  onClick={() => {
                    setError(null);
                    setView("forgot");
                  }}
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  className="text-left font-medium text-stone-900 underline underline-offset-4"
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
                <h2 className="text-2xl font-semibold text-stone-950">
                  {view === "forgot" ? "Reset your password" : "Activate your access"}
                </h2>
                <p className="text-sm leading-6 text-stone-600">
                  {view === "forgot"
                    ? "Enter your work email and we’ll send a one-time code so you can create a new password."
                    : "Enter your work email and we’ll send a one-time code to help you create your password."}
                </p>
              </div>
              <label className="block text-sm font-medium text-stone-700">
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
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending}>
                {pending ? "Sending code..." : "Send one-time code"}
              </Button>
              <button
                type="button"
                className="text-sm font-medium text-stone-700 underline underline-offset-4"
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
                <h2 className="text-2xl font-semibold text-stone-950">
                  {otpHeading.title}
                </h2>
                <p className="text-sm leading-6 text-stone-600">
                  {otpHeading.description}
                </p>
              </div>
              {otpMeta ? (
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-700">
                  <p>{otpMeta.message}</p>
                  <p className="mt-1 font-medium text-stone-950">
                    Destination: {otpMeta.destinationHint}
                  </p>
                  <p className="mt-1 text-stone-600">
                    The code expires in {otpMeta.expiresInMinutes} minutes.
                  </p>
                </div>
              ) : null}
              <label className="block text-sm font-medium text-stone-700">
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
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" type="submit" disabled={pending || otpCode.length !== 6}>
                {pending ? "Verifying..." : "Verify code"}
              </Button>
              <div className="flex flex-col gap-3 text-sm text-stone-600 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  className="font-medium text-stone-900 underline underline-offset-4 disabled:text-stone-400"
                  onClick={() => {
                    void requestOtp(otpPurpose);
                  }}
                  disabled={pending || cooldownSeconds > 0}
                >
                  {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  className="font-medium text-stone-700 underline underline-offset-4"
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
