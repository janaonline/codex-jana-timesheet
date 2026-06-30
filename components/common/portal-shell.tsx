"use client";

import { signOut } from "next-auth/react";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { GlobalLoaderLink } from "@/components/common/global-loader-link";
import { useGlobalLoader } from "@/components/common/global-loader-provider";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { APP_NAME } from "@/lib/constants";
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
  const { showBlockingLoader, hideLoader } = useGlobalLoader();
  const accessibleNavItems = navItems.filter((item) =>
    permissions.includes(item.permission),
  );

  async function handleSignOut() {
    const token = showBlockingLoader("Signing out...");

    try {
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      hideLoader(token);
      throw error;
    }
  }

  return (
    <div className="min-h-screen bg-(--color-bg)">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 lg:py-6">
        <aside className="rounded-[32px] border border-(--color-border) bg-(--color-surface) p-4 shadow-[0_14px_48px_-34px_rgba(17,17,17,0.25)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:flex-col lg:justify-start">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-(--color-text-muted)">
                  Janaagraha
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-(--color-text)">
                  {APP_NAME}
                </h1>
              </div>
              <ThemeToggle className="mt-1 shrink-0 lg:mt-2" />
            </div>
            <Button
              variant="secondary"
              className="sm:w-auto lg:hidden"
              onClick={() => void handleSignOut()}
            >
              Sign out
            </Button>
          </div>

          <div className="mt-5 rounded-[28px] border border-(--color-border) bg-(--color-surface-raised) px-4 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-(--color-text-muted)">Signed in as</p>
            <p className="mt-2 text-lg font-semibold text-(--color-text)">{userName}</p>
            <div className="mt-3">
              <Badge tone={role}>{role.replaceAll("_", " ")}</Badge>
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {accessibleNavItems.map((item) => (
              <GlobalLoaderLink
                key={item.href}
                href={item.href}
                loaderMessage="Loading page..."
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium transition lg:rounded-2xl lg:px-4 lg:py-3",
                  currentPath === item.href
                    ? "border-amber-300 bg-amber-300 text-stone-950"
                    : "border-(--color-border) bg-(--color-surface) text-(--color-text-subtle) hover:border-(--color-border-strong) hover:bg-(--color-surface-raised)",
                )}
              >
                {item.label}
              </GlobalLoaderLink>
            ))}
          </nav>

          <div className="mt-6 hidden lg:block">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void handleSignOut()}
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
