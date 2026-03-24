"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/common/button";
import { Card } from "@/components/common/card";
import { Input } from "@/components/common/input";

type SetPasswordResponse = {
  user: {
    email: string;
  };
  redirectUrl: string;
};

async function storeBrowserPasswordCredential(
  form: HTMLFormElement,
  email: string,
  password: string,
) {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !("credentials" in navigator)
  ) {
    return;
  }

  const PasswordCredentialCtor = (
    window as Window & {
      PasswordCredential?: new (
        data:
          | HTMLFormElement
          | {
              id: string;
              password: string;
              name?: string;
            },
      ) => Credential;
    }
  ).PasswordCredential;

  if (!PasswordCredentialCtor) {
    return;
  }

  try {
    const credential =
      form instanceof HTMLFormElement
        ? new PasswordCredentialCtor(form)
        : new PasswordCredentialCtor({
            id: email,
            password,
          });

    await navigator.credentials.store(credential);
  } catch {
    // Password manager support is best-effort only.
  }
}

export function SetPasswordScreen({
  email,
  redirectUrl,
}: {
  email: string;
  redirectUrl: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/auth/set-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password,
          confirmPassword,
        }),
      });

      const payload = (await response.json()) as
        | { ok: true; data: SetPasswordResponse }
        | { ok: false; error: { message: string; details?: string[] } };

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok
            ? "Unable to save your password."
            : payload.error.details?.join(" ") || payload.error.message,
        );
      }

      await storeBrowserPasswordCredential(formRef.current!, email, password);
      setSuccess(true);
      router.replace(payload.data.redirectUrl || redirectUrl);
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save your password.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 text-stone-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl rounded-[32px] border-stone-200 bg-white p-6 sm:p-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Secure password setup
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
              Create your password
            </h1>
            <p className="text-sm leading-6 text-stone-600">
              Use a strong password you can save to your browser password manager for
              faster sign-ins next time.
            </p>
          </div>

          <form ref={formRef} className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <input type="email" name="username" value={email} readOnly hidden />
            <label className="block text-sm font-medium text-stone-700">
              Work email
              <Input
                className="mt-2"
                type="email"
                value={email}
                readOnly
                autoComplete="username"
              />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              New password
              <Input
                className="mt-2"
                type="password"
                name="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Create a strong password"
                required
              />
            </label>
            <label className="block text-sm font-medium text-stone-700">
              Confirm password
              <Input
                className="mt-2"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter the same password"
                required
              />
            </label>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-600">
              Passwords must be at least 12 characters and include uppercase,
              lowercase, number, and special character combinations.
            </div>
            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Password saved. Redirecting you back into the portal.
              </p>
            ) : null}
            <Button className="w-full" type="submit" disabled={pending}>
              {pending ? "Saving password..." : "Save password and continue"}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
