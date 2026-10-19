"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, History, LayoutDashboard, LogOut, Plus, Settings, Users, Wallet } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/activity", label: "Activity", icon: History },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

interface ShellUser {
  name: string;
  email: string;
  image: string | null;
  id: string;
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Wallet className="size-4" />
      </span>
      {APP_NAME}
    </Link>
  );
}

function UnreadDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function UserMenu({ user, align = "end" }: { user: ShellUser; align?: "start" | "end" }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <UserAvatar id={user.id} name={user.name} image={user.image} size="sm" />
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings /> Profile & settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          onSelect={async () => {
            const result = await signOut();
            if (result.error) {
              toast.error("Couldn't sign out. Try again.");
              return;
            }
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ user, unread, children }: { user: ShellUser; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const groupMatch = /^\/groups\/([0-9a-f-]{36})/.exec(pathname);
  const addHref = groupMatch ? `/groups/${groupMatch[1]}/expenses/new` : "/expenses/new";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/60 px-3 py-4 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <Button asChild className="mx-1 mt-6">
          <Link href={addHref}>
            <Plus /> Add expense
          </Link>
        </Button>
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive(pathname, href) && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === "/notifications" && <UnreadDot count={unread} />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t pt-3">
          <UserMenu user={user} align="start" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell />
                {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary" />}
              </Link>
            </Button>
            <UserMenu user={user} />
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-safe backdrop-blur lg:hidden"
        >
          <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
            {NAV.slice(0, 2).map(({ href, label, icon: Icon }) => (
              <MobileNavLink key={href} href={href} label={label} active={isActive(pathname, href)} icon={<Icon className="size-5" />} />
            ))}
            <div className="flex justify-center">
              <Link
                href={addHref}
                aria-label="Add expense"
                className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95"
              >
                <Plus className="size-6" />
              </Link>
            </div>
            <MobileNavLink href="/activity" label="Activity" active={isActive(pathname, "/activity")} icon={<History className="size-5" />} />
            <MobileNavLink href="/settings" label="Settings" active={isActive(pathname, "/settings")} icon={<Settings className="size-5" />} />
          </div>
        </nav>
      </div>
    </div>
  );
}

function MobileNavLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground",
        active && "text-primary",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
