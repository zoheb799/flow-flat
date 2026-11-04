"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { ArrowDownRight, ArrowUpRight, Bell, Check, ChevronDown, CirclePlus, LoaderCircle, LogOut, Pencil, Plus, Users, WalletCards } from "lucide-react";
import { PwaRegistration } from "@/components/pwa-registration";

type Household = {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
  createdBy: string;
  createdByName: string;
  createdByMe: boolean;
  members: Array<{ id: string; name: string }>;
};
type DashboardData = {
  household: { id: string; name: string };
  role: "ADMIN" | "MEMBER";
  members: Array<{ id: string; name: string; balancePaise: number; walletId: string | null; monthlyExpenditurePaise: number }>;
  recentMeals: Array<{ id: string; name: string; totalPaise: number; eatenAt: string; participantCount: number }>;
  commonFund: { collectedPaise: number; spentPaise: number };
};
type GroupHistory = {
  household: { id: string; name: string; createdBy: string; createdByName: string };
  members: Array<{ id: string; name: string; role: "ADMIN" | "MEMBER" }>;
  meals: Array<{ id: string; name: string; category: string; totalPaise: number; description: string | null; eatenAt: string; cancelledAt: string | null; payerName: string }>;
  contributions: Array<{ id: string; name: string; amountPaise: number; createdAt: string; periodStartsAt: string }>;
  expenses: Array<{ id: string; category: string; description: string; amountPaise: number; purchasedAt: string; purchaserName: string; periodStartsAt: string }>;
};
type LoadState = "loading" | "ready" | "error";
const formatMoney = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function Dashboard({ userName }: { userName: string }) {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeId, setActiveId] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [groupHistoryId, setGroupHistoryId] = useState("");
  const [groupHistory, setGroupHistory] = useState<GroupHistory | null>(null);
  const [groupHistoryLoading, setGroupHistoryLoading] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingHouseholdId, setEditingHouseholdId] = useState("");
  const [editedHouseholdName, setEditedHouseholdName] = useState("");
  const [savingHousehold, setSavingHousehold] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberMessage, setMemberMessage] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/households");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load your households.");
        if (active) {
          setHouseholds(result);
          setActiveId((current) => current && result.some((item: Household) => item.id === current) ? current : result[0]?.id ?? "");
          setState("ready");
        }
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load your households.");
        setState("error");
      }
    }
    void loadHouseholds();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    async function loadDashboard() {
      try {
        const response = await fetch(`/api/households/${activeId}/dashboard`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load your dashboard.");
        if (active) {
          setData(result);
          setState("ready");
          setError("");
        }
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load your dashboard.");
        setState("error");
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, [activeId]);

  useEffect(() => {
    if (!groupHistoryId) return;
    let active = true;
    async function loadGroupHistory() {
      try {
        const response = await fetch(`/api/households/${groupHistoryId}/history`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load group history.");
        if (active) setGroupHistory(result);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load group history.");
      } finally {
        if (active) setGroupHistoryLoading(false);
      }
    }
    void loadGroupHistory();
    return () => { active = false; };
  }, [groupHistoryId]);

  const householdBalance = data?.role === "ADMIN" ? data.members.reduce((total, member) => total + member.balancePaise, 0) : null;
  const rationBalance = data ? data.commonFund.collectedPaise - data.commonFund.spentPaise : 0;
  const viewState = activeId && data?.household.id !== activeId && state !== "error" ? "loading" : state;

  function openGroupDetails(householdId: string) {
    setActiveId(householdId);
    setGroupHistory(null);
    setGroupHistoryLoading(true);
    setGroupHistoryId(householdId);
  }

  async function createHousehold(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: householdName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to create household.");
      setHouseholdName("");
      const householdResponse = await fetch("/api/households");
      const refreshedHouseholds = await householdResponse.json();
      if (!householdResponse.ok) throw new Error(refreshedHouseholds.error ?? "Unable to refresh your households.");
      setHouseholds(refreshedHouseholds);
      setActiveId(result.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create household.");
    } finally {
      setCreating(false);
    }
  }

  async function updateHousehold(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingHouseholdId) return;
    setSavingHousehold(true);
    setError("");
    try {
      const response = await fetch(`/api/households/${editingHouseholdId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedHouseholdName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update group.");
      setHouseholds((current) => current.map((household) => household.id === result.id
        ? { ...household, name: result.name }
        : household));
      setEditingHouseholdId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update group.");
    } finally {
      setSavingHousehold(false);
    }
  }

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId) return;
    setAddingMember(true);
    setError("");
    setMemberMessage("");
    try {
      const response = await fetch(`/api/households/${activeId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: memberName, phone: memberPhone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to add household member.");
      setMemberMessage(`${result.name} was added to the household.`);
      setMemberName("");
      setMemberPhone("");
      const householdsResponse = await fetch("/api/households");
      const householdsResult = await householdsResponse.json();
      if (!householdsResponse.ok) throw new Error(householdsResult.error ?? "Member was added, but the group list could not be refreshed.");
      setHouseholds(householdsResult);
      const dashboardResponse = await fetch(`/api/households/${activeId}/dashboard`);
      const dashboardResult = await dashboardResponse.json();
      if (!dashboardResponse.ok) throw new Error(dashboardResult.error ?? "Member was added, but the dashboard could not be refreshed.");
      setData(dashboardResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add household member.");
    } finally {
      setAddingMember(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-slate-900">
      <main>
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-slate-200 bg-[#f7f8f6]/95 px-5 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="FlatFlow home" className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white"><WalletCards size={19} /></Link>
            {households.length > 0 && (
              <label className="relative">
                <span className="sr-only">Select household</span>
                <select value={activeId} onChange={(event) => setActiveId(event.target.value)} className="max-w-[200px] appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-semibold outline-none focus:border-emerald-600">
                  {households.map((household) => <option value={household.id} key={household.id}>{household.name}</option>)}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </label>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PwaRegistration householdId={activeId || undefined} />
            <Link href="/notifications" aria-label="Notifications" className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600"><Bell size={17} /></Link>
            <span className="hidden text-sm font-medium sm:block">{userName}</span>
            <button onClick={() => signOut({ callbackUrl: "/" })} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-white" aria-label="Log out"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-5 pb-8 pt-8 sm:px-8 sm:pb-8 lg:pt-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Your household at a glance</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[30px]">{data?.household.name ?? "Overview"}</h1>
            </div>
            {data?.role === "ADMIN" && (
              <Link href="/meals/new" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><Plus size={16} /> Record a meal</Link>
            )}
          </div>

          {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
          {viewState === "loading" && <div className="flex min-h-56 items-center justify-center text-sm text-slate-500"><LoaderCircle size={18} className="mr-2 animate-spin" /> Loading household data…</div>}

          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Your groups</h2>
                <p className="mt-1 text-sm text-slate-500">See groups you created or joined, and who belongs to each one.</p>
              </div>
              <form onSubmit={createHousehold} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} required minLength={2} maxLength={80} placeholder="New group name" aria-label="New group name" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
                <button disabled={creating} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><CirclePlus size={16} /> Create group</button>
              </form>
            </div>
            {households.length === 0 ? (
              <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">You haven’t created or joined a group yet. Create one above to get started.</p>
            ) : (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                {([
                  { title: "Created by you", groups: households.filter((household) => household.createdByMe) },
                  { title: "Groups you joined", groups: households.filter((household) => !household.createdByMe) },
                ]).map(({ title, groups }) => (
                  <section key={title} className="min-w-0">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
                    {groups.length ? <div className="space-y-2">
                      {groups.map((household) => (
                        <article key={household.id} className={`rounded-xl border p-3.5 transition ${activeId === household.id ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <button onClick={() => openGroupDetails(household.id)} className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-sm font-semibold">{household.name}</span>
                              <span className="mt-1 block text-xs text-slate-500">{household.createdByMe ? "You created this group" : `Created by ${household.createdByName}`}</span>
                            </button>
                            {household.createdByMe && editingHouseholdId !== household.id && (
                              <button onClick={() => { setEditingHouseholdId(household.id); setEditedHouseholdName(household.name); }} aria-label={`Edit ${household.name}`} className="rounded-md p-2 text-slate-500 hover:bg-white hover:text-emerald-800"><Pencil size={15} /></button>
                            )}
                          </div>
                          {editingHouseholdId === household.id && (
                            <form onSubmit={updateHousehold} className="mt-3 flex gap-2">
                              <input value={editedHouseholdName} onChange={(event) => setEditedHouseholdName(event.target.value)} required minLength={2} maxLength={80} aria-label="Group name" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-emerald-600" />
                              <button disabled={savingHousehold} aria-label="Save group name" className="rounded-md bg-emerald-700 px-3 text-white disabled:opacity-60"><Check size={16} /></button>
                              <button type="button" onClick={() => setEditingHouseholdId("")} className="rounded-md border border-slate-300 px-3 text-sm text-slate-600">Cancel</button>
                            </form>
                          )}
                          <div className="mt-3 border-t border-slate-200/80 pt-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Members · {household.members.length}</p>
                            <p className="mt-1.5 text-xs leading-5 text-slate-600">{household.members.map((member) => member.name).join(", ")}</p>
                            {!household.createdByMe && <p className="mt-2 text-[11px] text-slate-500">View only · only the group creator can edit or add members.</p>}
                          </div>
                        </article>
                      ))}
                    </div> : <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">None yet.</p>}
                  </section>
                ))}
              </div>
            )}
          </section>

          {groupHistoryId && (
            <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Group details & history</p>
                <h2 className="mt-1 text-xl font-semibold">{groupHistory?.household.name ?? households.find((item) => item.id === groupHistoryId)?.name}</h2>
                {groupHistory && <p className="mt-1 text-sm text-slate-500">Created by {groupHistory.household.createdByName} · {groupHistory.members.length} members</p>}
              </div>
              {groupHistoryLoading && <div className="flex min-h-32 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading group history…</div>}
              {groupHistory && groupHistory.household.id === groupHistoryId && (
                <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">
                  <section>
                    <h3 className="text-sm font-semibold">Members</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {groupHistory.members.map((member) => (
                        <span key={member.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                          {member.name}{member.id === groupHistory.household.createdBy && <span className="text-emerald-800">· Creator</span>}
                        </span>
                      ))}
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">Meal expense history</h3>
                      <Link href="/reports" className="text-xs font-semibold text-emerald-800 hover:underline">Monthly reports</Link>
                    </div>
                    <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
                      {groupHistory.meals.length ? groupHistory.meals.map((meal) => (
                        <Link href={`/meals/${meal.id}`} key={meal.id} className="flex items-center justify-between gap-3 px-3.5 py-3 hover:bg-slate-50">
                          <span className="min-w-0"><span className="block truncate text-sm font-medium">{meal.name}</span><span className="mt-1 block text-xs text-slate-500">{meal.payerName} · {new Date(meal.eatenAt).toLocaleDateString()} · {meal.category.replaceAll("_", " ")}</span></span>
                          <span className="shrink-0 text-sm font-semibold">{formatMoney(meal.totalPaise)}</span>
                        </Link>
                      )) : <p className="px-3.5 py-4 text-sm text-slate-500">No meal expenses recorded yet.</p>}
                    </div>
                    {groupHistory.meals.length === 50 && <p className="mt-2 text-xs text-slate-500">Showing the 50 most recent meals.</p>}
                  </section>
                  <GroupHistoryList
                    title="Shared fund contributions"
                    empty="No shared-fund contributions yet."
                    entries={groupHistory.contributions.map((entry) => ({
                      id: entry.id,
                      title: entry.name,
                      detail: `${new Date(entry.createdAt).toLocaleDateString()} · ${new Date(entry.periodStartsAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
                      amountPaise: entry.amountPaise,
                    }))}
                  />
                  <GroupHistoryList
                    title="Shared expense history"
                    empty="No shared expenses recorded yet."
                    entries={groupHistory.expenses.map((entry) => ({
                      id: entry.id,
                      title: entry.description,
                      detail: `${entry.purchaserName} · ${new Date(entry.purchasedAt).toLocaleDateString()} · ${entry.category.replaceAll("_", " ")}`,
                      amountPaise: entry.amountPaise,
                    }))}
                  />
                </div>
              )}
            </section>
          )}

          {data && data.household.id === activeId && viewState === "ready" && (
            <>
              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard title={data.role === "ADMIN" ? "Household wallets" : "My wallet"} value={formatMoney(data.role === "ADMIN" ? householdBalance ?? 0 : data.members[0]?.balancePaise ?? 0)} icon={<WalletCards size={18} />} tone="green" />
                <SummaryCard title="Common fund balance" value={formatMoney(rationBalance)} icon={<ArrowUpRight size={18} />} tone="blue" />
                <SummaryCard title="Ration collected" value={formatMoney(data.commonFund.collectedPaise)} icon={<ArrowDownRight size={18} />} tone="amber" />
                <SummaryCard title="Members" value={String(data.members.length)} icon={<Users size={18} />} tone="slate" />
              </section>
              <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div><h2 className="text-sm font-semibold">Member wallets</h2><p className="mt-1 text-xs text-slate-500">{data.role === "ADMIN" ? "Balances across your household" : "Your personal food wallet"}</p></div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{data.members.length} members</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
                          <div className="min-w-0"><p className="truncate text-sm font-medium">{member.name}</p><p className="mt-0.5 text-xs text-slate-500">Spent {formatMoney(member.monthlyExpenditurePaise)}</p></div>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(member.balancePaise)}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Recent meals</h2><p className="mt-1 text-xs text-slate-500">Latest household food expenses</p></div>
                  {data.recentMeals.length ? <div className="divide-y divide-slate-100">
                    {data.recentMeals.map((meal) => <div key={meal.id} className="flex items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{meal.name}</p><p className="mt-1 text-xs text-slate-500">{meal.participantCount} participants · {new Date(meal.eatenAt).toLocaleDateString()}</p></div>
                      <span className="shrink-0 text-sm font-semibold">{formatMoney(meal.totalPaise)}</span>
                    </div>)}
                  </div> : <div className="px-5 py-10 text-center"><p className="text-sm font-medium">No meals recorded yet</p><p className="mt-1 text-xs text-slate-500">Recorded meals will appear here.</p></div>}
                </section>
              </div>
              {data.role === "ADMIN" && <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-sm font-semibold">Add a housemate</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Add someone immediately. We’ll create their account if needed, and they can sign in later with this phone number. You’re the household admin and control group prices and expenses.</p>
                <form onSubmit={addMember} className="mt-4 flex flex-col gap-3 sm:max-w-xl sm:flex-row">
                  <input type="text" required minLength={2} maxLength={80} value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Housemate name" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
                  <input type="tel" required minLength={8} maxLength={20} value={memberPhone} onChange={(event) => setMemberPhone(event.target.value)} placeholder="+91 98765 43210" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
                  <button disabled={addingMember} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{addingMember && <LoaderCircle size={15} className="animate-spin" />} Add member</button>
                </form>
                {memberMessage && <p role="status" className="mt-3 text-sm text-emerald-800">{memberMessage}</p>}
              </section>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function GroupHistoryList({ title, empty, entries }: {
  title: string;
  empty: string;
  entries: Array<{ id: string; title: string; detail: string; amountPaise: number }>;
}) {
  return <section>
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
      {entries.length ? entries.map((entry) => (
        <div key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{entry.title}</span><span className="mt-1 block text-xs text-slate-500">{entry.detail}</span></span>
          <span className="shrink-0 text-sm font-semibold">{formatMoney(entry.amountPaise)}</span>
        </div>
      )) : <p className="px-3.5 py-4 text-sm text-slate-500">{empty}</p>}
    </div>
    {entries.length === 50 && <p className="mt-2 text-xs text-slate-500">Showing the 50 most recent entries.</p>}
  </section>;
}

function SummaryCard({ title, value, icon, tone }: { title: string; value: string; icon: React.ReactNode; tone: "green" | "blue" | "amber" | "slate" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return <article className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{title}</p><span className={`grid size-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span></div>
    <p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
  </article>;
}
