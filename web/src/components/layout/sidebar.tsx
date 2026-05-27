"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  LockKeyhole as Vault,
  Users,
  Settings,
  LogOut,
  ArrowDownToLine,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vaults", label: "Vaults", icon: Vault },
  { href: "/beneficiaries", label: "Beneficiaries", icon: Users },
  { href: "/import", label: "Import", icon: ArrowDownToLine },
  { href: "/settings", label: "Settings", icon: Settings },
];

const adminNavItem = { href: "/admin", label: "Admin Panel", icon: ShieldCheck };

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const allNavItems = user?.role === "admin" ? [...navItems, adminNavItem] : navItems;
  const { data: branding } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.getBranding(),
    staleTime: Infinity,
  });
  const appName = branding?.app_name || "P.S. Vault";

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-surface">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 px-5 border-b border-border">
        <img src="/logo.png" alt={appName} className="h-7 w-7 rounded-md" />
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
  const { user } = useAuthStore();
  const mobileItems = user?.role === "admin" ? [...navItems, adminNavItem] : navItems;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-surface md:hidden"
      aria-label="Mobile navigation"
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-colors",
              isActive ? "text-primary-600" : "text-text-muted"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
