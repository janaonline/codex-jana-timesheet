import Link from "next/link";

import { Button } from "@/components/common/button";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-950 px-4 text-white">
      <div className="max-w-xl rounded-[28px] bg-white/10 p-8 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-300">Access denied</p>
        <h1 className="mt-3 text-3xl font-semibold">This area is not available for your role.</h1>
        <p className="mt-4 text-sm text-stone-200">
          Route protection and RBAC are enforced according to the timesheet system&apos;s
          role model.
        </p>
        <Link href="/">
          <Button className="mt-6">Return to portal</Button>
        </Link>
      </div>
    </main>
  );
}
