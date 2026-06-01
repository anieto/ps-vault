"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  LockKeyhole as Vault,
  Users,
  Settings,
  LogOut,
  ShieldEllipsis,
  ArrowDownToLine,
  ShieldAlert,
  Sun,
  Moon,
  Monitor,
  MoreHorizontal,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vaults", label: "Vaults", icon: Vault },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/import", label: "Import", icon: ArrowDownToLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNavItem = { href: "/admin", label: "Admin Panel", icon: ShieldAlert };

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const allNavItems = user?.role === "admin" ? [...navItems, adminNavItem] : navItems;
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border">
        {branding?.app_name ? (
          <ShieldEllipsis className="h-5 w-5 text-primary" aria-hidden />
        ) : (
          <img src="/logo.png" alt={appName} className="h-9 w-9 rounded-md" />
        )}
        <span className="text-base font-semibold text-text-primary">{appName}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Main navigation">
        <ul className="flex flex-col gap-0.5">
          {allNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-primary-50 text-primary-600"
                      : "text-text-secondary hover:bg-surface-muted hover:text-text-primary"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Theme toggle */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-text-muted flex-1">Appearance</span>
          <div className="flex rounded-md border border-border overflow-hidden">
            {([["light", Sun], ["system", Monitor], ["dark", Moon]] as const).map(([t, Icon]) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                aria-label={t}
                className={cn(
                  "p-1.5 transition-colors",
                  theme === t
                    ? "bg-primary text-primary-foreground"
                    : "text-text-muted hover:bg-surface-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* User + logout */}
      <div className="border-t border-border p-4">
        <div className="mb-2 px-1">
          <p className="text-sm font-medium text-text-primary truncate">
            {user?.display_name}
          </p>
          <p className="text-xs text-text-muted truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-text-secondary"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </aside>
  );
}

// Mobile bottom navigation
export function MobileNav() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const [moreOpen, setMoreOpen] = useState(false);

  const coreItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/vaults", label: "Vaults", icon: Vault },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const moreItems = [
    { href: "/import", label: "Import", icon: ArrowDownToLine },
    ...(user?.role === "admin" ? [adminNavItem] : []),
  ];

  return (
    <>
      <nav
        className="mobile-nav fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-surface md:hidden"
        aria-label="Mobile navigation"
      >
        {coreItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 px-1 text-xs font-medium transition-colors",
                isActive ? "text-primary-600" : "text-text-muted"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}

        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-3 px-1 text-xs font-medium transition-colors",
            moreOpen ? "text-primary-600" : "text-text-muted"
          )}
          aria-label="More options"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
          More
        </button>
      </nav>

      {/* More drawer */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/40 md:hidden"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-surface border-t border-border rounded-t-2xl pb-8 md:hidden">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-border" />
            </div>

            <div className="px-4 space-y-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors",
                      isActive ? "bg-primary-50 text-primary-600" : "text-text-primary hover:bg-surface-muted"
                    )}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                );
              })}

              <div className="h-px bg-border my-2" />

              <div className="flex items-center gap-3 px-3 py-3">
                <span className="text-sm font-medium text-text-primary flex-1">Appearance</span>
                <div className="flex rounded-md border border-border overflow-hidden">
                  {([["light", Sun], ["system", Monitor], ["dark", Moon]] as const).map(([t, Icon]) => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setMoreOpen(false); }}
                      aria-label={t}
                      className={cn(
                        "p-2 transition-colors",
                        theme === t
                          ? "bg-primary text-primary-foreground"
                          : "text-text-muted hover:bg-surface-muted"
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => { logout(); setMoreOpen(false); }}
                className="flex w-full items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-text-primary hover:bg-surface-muted transition-colors"
              >
                <LogOut className="h-5 w-5 flex-shrink-0" aria-hidden />
                Sign out
              </button>

              <div className="border-t border-border mt-2 pt-3 px-3">
                <p className="text-sm font-medium text-text-primary truncate">{user?.display_name}</p>
                <p className="text-xs text-text-muted truncate">{user?.email}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
