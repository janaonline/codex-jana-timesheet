"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { cn } from "@/lib/utils";
import type { Permission, UserRole } from "@/lib/constants";

const navItems = [
  { href: "/dashboard", label: "Dashboard", permission: "timesheets:read:self" as Permission },
  { href: "/admin", label: "Admin", permission: "reports:read:admin" as Permission },
  {
    href: "/admin/edit-requests",
    label: "Edit Requests",
    permission: "edit-requests:review" as Permission,
  },
  { href: "/admin/reports", label: "Reports", permission: "reports:read:admin" as Permission },
];

export function PortalShell({
  children,
  role,
  permissions,
  userName,
  currentPath,
}: {
  children: React.ReactNode;
  role: UserRole;
  permissions: Permission[];
  userName: string;
  currentPath: string;
}) {
  const accessibleNavItems = navItems.filter((item) =>
    permissions.includes(item.permission),
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 lg:py-6">
        <aside className="rounded-[32px] border border-stone-200 bg-white p-4 shadow-[0_14px_48px_-34px_rgba(17,17,17,0.25)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:justify-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
                Janaagraha
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-stone-950">
                Directors Timesheet
              </h1>
            </div>
            <Button
              variant="secondary"
              className="sm:w-auto lg:hidden"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>

          <div className="mt-5 rounded-[28px] border border-stone-200 bg-stone-50 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Signed in as</p>
            <p className="mt-2 text-lg font-semibold text-stone-950">{userName}</p>
            <div className="mt-3">
              <Badge tone={role}>{role.replaceAll("_", " ")}</Badge>
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {accessibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium transition lg:rounded-2xl lg:px-4 lg:py-3",
                  currentPath === item.href
                    ? "border-amber-300 bg-amber-300 text-stone-950"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-6 hidden lg:block">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </aside>
        <main className="min-w-0 space-y-6 pb-6">{children}</main>
      </div>
    </div>
  );
}
