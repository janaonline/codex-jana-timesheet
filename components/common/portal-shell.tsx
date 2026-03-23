"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/constants";

const navItems = [
  { href: "/dashboard", label: "Dashboard", roles: ["PROGRAM_HEAD"] as UserRole[] },
  { href: "/admin", label: "Admin", roles: ["ADMIN", "OPERATIONS"] as UserRole[] },
  { href: "/admin/edit-requests", label: "Edit Requests", roles: ["ADMIN", "OPERATIONS"] as UserRole[] },
  { href: "/admin/reports", label: "Reports", roles: ["ADMIN", "OPERATIONS"] as UserRole[] },
];

export function PortalShell({
  children,
  role,
  userName,
  currentPath,
}: {
  children: React.ReactNode;
  role: UserRole;
  userName: string;
  currentPath: string;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(13,148,136,0.18),_transparent_32%),linear-gradient(180deg,_#f7f4ed_0%,_#f2efe8_42%,_#ece8df_100%)]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[32px] border border-stone-200 bg-white/85 p-6 shadow-[0_25px_60px_-40px_rgba(15,23,42,0.4)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
            Janaagraha
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-950">
            Directors Timesheet
          </h1>
          <div className="mt-6 rounded-[24px] bg-stone-950 px-4 py-4 text-white">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-300">Signed in as</p>
            <p className="mt-2 text-lg font-semibold">{userName}</p>
            <Badge tone={role}>{role.replaceAll("_", " ")}</Badge>
          </div>
          <nav className="mt-8 flex flex-col gap-2">
            {navItems
              .filter((item) => item.roles.includes(role))
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm font-medium transition",
                    currentPath === item.href
                      ? "bg-teal-700 text-white"
                      : "text-stone-700 hover:bg-stone-100",
                  )}
                >
                  {item.label}
                </Link>
              ))}
          </nav>
          <div className="mt-8">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
