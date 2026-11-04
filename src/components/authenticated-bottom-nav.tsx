"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Bell, Home, ShieldCheck, Users, WalletCards } from "lucide-react";

type SessionResponse = { user?: { id?: string } } | null;
type Household = { role: "ADMIN" | "MEMBER" };

export function AuthenticatedBottomNav() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [hasAdminGroup, setHasAdminGroup] = useState(false);

  useEffect(() => {
    let active = true;
    async function refreshAccess() {
      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        if (!sessionResponse.ok) throw new Error("Unable to check sign-in status.");
        const session: SessionResponse = await sessionResponse.json();
        if (!session?.user?.id) {
          if (active) {
            setVisible(false);
            setHasAdminGroup(false);
          }
          return;
        }

        const householdsResponse = await fetch("/api/households", { cache: "no-store" });
        if (!householdsResponse.ok) throw new Error("Unable to check group access.");
        const households: Household[] = await householdsResponse.json();
        if (active) {
          setVisible(true);
          setHasAdminGroup(households.some((household) => household.role === "ADMIN"));
        }
      } catch (error) {
        if (active) {
          setVisible(false);
          setHasAdminGroup(false);
        }
        console.error("Failed to load navigation access.", error);
      }
    }

    void refreshAccess();
    return () => { active = false; };
  }, [pathname]);

  if (!visible) return null;

  return <>
    <div aria-hidden="true" className="h-20 shrink-0" />
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-around gap-1">
        <NavLink href="/dashboard" active={pathname === "/dashboard"} icon={<Home size={19} />} label="Home" />
        <NavLink href="/wallet" active={pathname.startsWith("/wallet")} icon={<WalletCards size={19} />} label="Wallet" />
        <NavLink href="/meals/new" active={pathname.startsWith("/meals")} icon={<Activity size={19} />} label="Meals" />
        <NavLink href="/ration" active={pathname.startsWith("/ration")} icon={<Users size={19} />} label="Ration" />
        <NavLink href="/reports" active={pathname.startsWith("/reports")} icon={<Activity size={19} />} label="Reports" />
        <NavLink href="/notifications" active={pathname.startsWith("/notifications")} icon={<Bell size={19} />} label="Updates" />
        {hasAdminGroup && <NavLink href="/audit-logs" active={pathname.startsWith("/audit-logs")} icon={<ShieldCheck size={19} />} label="Audit" />}
      </div>
    </nav>
  </>;
}

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition sm:py-2 sm:text-xs ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
    {icon}<span className="truncate">{label}</span>
  </Link>;
}
