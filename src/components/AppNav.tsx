"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cloud,
  LayoutDashboard,
  ClipboardCheck,
  CalendarRange,
  BookOpen,
  Dumbbell,
  Timer,
  Shield,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { signOutAction } from "@/lib/auth-actions";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assessment", label: "Assessment", icon: ClipboardCheck },
  { href: "/study-plan", label: "Study Plan", icon: CalendarRange },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/practice", label: "Practice", icon: Dumbbell },
  { href: "/exam", label: "Exam", icon: Timer },
];

const adminLink = { href: "/admin", label: "Admin", icon: Shield };

export function AppNav({ name, role }: { name?: string | null; role?: string }) {
  const pathname = usePathname();
  const links = role === "admin" ? [...LINKS, adminLink] : LINKS;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4">
        <Link href="/dashboard" className="mr-3 flex items-center gap-2">
          <Cloud className="text-brand-600" size={22} />
          <span className="hidden font-semibold sm:inline">PCA Prep</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5 overflow-x-auto">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <l.icon size={16} />
                <span className="hidden md:inline">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 pl-2">
          {name ? (
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
          ) : null}
          <ThemeToggle />
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
