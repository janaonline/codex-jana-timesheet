"use client";

import { startTransition, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/common/button";
import { Input } from "@/components/common/input";

const LOCAL_DEV_ACCOUNTS = [
  {
    email: "anita.director@janaagraha.org",
    label: "Anita Director",
    roleLabel: "Program Head",
  },
  {
    email: "ravi.director@janaagraha.org",
    label: "Ravi Director",
    roleLabel: "Program Head",
  },
  {
    email: "girija.admin@janaagraha.org",
    label: "Girija Admin",
    roleLabel: "Admin",
  },
  {
    email: "kishora.admin@janaagraha.org",
    label: "Kishora Admin",
    roleLabel: "Admin",
  },
  {
    email: "mira.operations@janaagraha.org",
    label: "Mira Operations",
    roleLabel: "Operations",
  },
] as const;

export function LoginScreen({
  azureEnabled,
  localAuthEnabled,
}: {
  azureEnabled: boolean;
  localAuthEnabled: boolean;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [localEmail, setLocalEmail] = useState<string>(LOCAL_DEV_ACCOUNTS[0].email);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLocalSigningIn, setIsLocalSigningIn] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    if (session?.user.role === "PROGRAM_HEAD") {
      router.replace("/dashboard");
      return;
    }

    router.replace("/admin");
  }, [router, session?.user.role, status]);

  async function runLocalSignIn(email: string) {
    setLocalError(null);
    setIsLocalSigningIn(true);

    const result = await signIn("local-dev", {
      email,
      callbackUrl: "/",
      redirect: false,
    });

    if (result?.error) {
      setLocalError(
        "The selected local account is not available yet. Run the database seed and try again.",
      );
      setIsLocalSigningIn(false);
      return;
    }

    startTransition(() => {
      router.replace(result?.url ?? "/");
      router.refresh();
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(13,148,136,0.22),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(37,99,235,0.22),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_42%,_#1f2937)] px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[36px] border border-white/10 bg-white/6 p-8 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-200">Janaagraha internal portal</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight">
            Directors Timesheet Management System
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-200">
            The MVP streamlines directors&apos; monthly time capture, reminders,
            auto-submit on the 5th at 12:00 AM IST, controlled unfreeze requests, and
            admin reporting through one lean Next.js application.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              "Microsoft Entra ID / Azure AD SSO",
              "Auto-save with local fallback and retry",
              "Edit-request approval workflow",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[24px] border border-white/10 bg-white/8 p-5 text-sm text-stone-100"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          {azureEnabled ? (
            <div className="rounded-[36px] bg-white p-8 text-stone-950 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Secure sign-in</p>
              <h2 className="mt-3 text-3xl font-semibold">Continue with Microsoft SSO</h2>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Authentication is handled through Microsoft organizational accounts only. No
                separate username or password is stored in this application.
              </p>
              <Button
                className="mt-8 w-full"
                onClick={() => signIn("azure-ad", { callbackUrl: "/" })}
              >
                Sign in with Microsoft
              </Button>
            </div>
          ) : null}

          {localAuthEnabled ? (
            <div className="rounded-[36px] border border-amber-200/50 bg-amber-50 p-8 text-stone-950 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.26em] text-amber-700">
                Development-only sign-in
              </p>
              <h2 className="mt-3 text-3xl font-semibold">Use a seeded local account</h2>
              <p className="mt-4 text-sm leading-6 text-stone-700">
                This path exists only for local development when Azure tenant credentials are
                not available. Production authentication remains Microsoft Entra ID / Azure AD.
              </p>
              <form
                className="mt-6 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runLocalSignIn(localEmail);
                }}
              >
                <label className="block text-sm font-medium text-stone-700" htmlFor="local-email">
                  Seeded user email
                </label>
                <Input
                  id="local-email"
                  type="email"
                  value={localEmail}
                  onChange={(event) => setLocalEmail(event.target.value)}
                  placeholder="anita.director@janaagraha.org"
                  autoComplete="email"
                />
                <Button className="w-full" disabled={isLocalSigningIn} type="submit">
                  {isLocalSigningIn ? "Signing in..." : "Sign in with local development account"}
                </Button>
              </form>
              {localError ? (
                <p className="mt-3 rounded-2xl bg-rose-100 px-4 py-3 text-sm text-rose-700">
                  {localError}
                </p>
              ) : null}
              <div className="mt-6 grid gap-3">
                {LOCAL_DEV_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    className="flex items-center justify-between rounded-[22px] border border-amber-200 bg-white px-4 py-4 text-left transition hover:border-amber-400 hover:bg-amber-100/40"
                    onClick={() => {
                      setLocalEmail(account.email);
                      void runLocalSignIn(account.email);
                    }}
                    disabled={isLocalSigningIn}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-stone-950">
                        {account.label}
                      </span>
                      <span className="block text-xs uppercase tracking-[0.2em] text-stone-500">
                        {account.roleLabel}
                      </span>
                    </span>
                    <span className="text-sm text-stone-600">{account.email}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!azureEnabled && !localAuthEnabled ? (
            <div className="rounded-[36px] bg-white p-8 text-stone-950 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.26em] text-stone-500">Configuration required</p>
              <h2 className="mt-3 text-3xl font-semibold">Authentication is not configured yet</h2>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Add Azure AD credentials for production-like sign-in, or enable local
                development auth in `.env.local` to exercise the seeded workflows.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
