"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, LoaderCircle, Plus, WalletCards } from "lucide-react";

type Household = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type WalletSummary = { id: string; memberId: string; memberName: string; balancePaise: number; lowBalancePaise: number; monthlyContributionsPaise: number; monthlySpentPaise: number };
type WalletTransaction = { id: string; memberId: string; memberName: string; type: string; amountPaise: number; description: string; createdAt: string };
type WalletResponse = { wallets: WalletSummary[]; transactions: WalletTransaction[] };
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

function parsePaise(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export function WalletOverview() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loadedHouseholdId, setLoadedHouseholdId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contributionMode, setContributionMode] = useState<"equal" | "custom">("equal");
  const [equalAmount, setEqualAmount] = useState("");
  const [memberAmounts, setMemberAmounts] = useState<Record<string, string>>({});
  const [description, setDescription] = useState("Monthly food contribution");
  const [pending, setPending] = useState(false);

  const loadWallets = useCallback(async (id: string) => {
    const response = await fetch(`/api/households/${id}/wallets`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load wallet history.");
    setData(result);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/households");
        const result: Household[] = await response.json();
        if (!response.ok) throw new Error("Unable to load households.");
        if (active) {
          setHouseholds(result);
          setHouseholdId(result[0]?.id ?? "");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load households.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadHouseholds();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!householdId) return;
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/households/${householdId}/wallets`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load wallet history.");
        if (active) {
          setData(result);
          setLoadedHouseholdId(householdId);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setLoadedHouseholdId(householdId);
          setError(caught instanceof Error ? caught.message : "Unable to load wallet.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [householdId]);

  const isAdmin = households.find((item) => item.id === householdId)?.role === "ADMIN";
  const viewLoading = loading || (!!householdId && loadedHouseholdId !== householdId);
  const activeWallet = data?.wallets[0];

  async function addContribution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contributions = contributionMode === "equal"
      ? (() => {
        const amountPaise = parsePaise(equalAmount);
        return amountPaise
          ? data?.wallets.map((wallet) => ({ memberId: wallet.memberId, amountPaise })) ?? []
          : [];
      })()
      : (data?.wallets ?? []).flatMap((wallet) => {
        const value = memberAmounts[wallet.memberId]?.trim();
        if (!value) return [];
        const amountPaise = parsePaise(value);
        return amountPaise ? [{ memberId: wallet.memberId, amountPaise }] : [];
      });

    const customHasInvalidAmount = contributionMode === "custom"
      && (data?.wallets ?? []).some((wallet) => {
        const value = memberAmounts[wallet.memberId]?.trim();
        return Boolean(value) && parsePaise(value) === null;
      });
    if (!contributions.length || customHasInvalidAmount) {
      setError(customHasInvalidAmount
        ? "Enter a valid positive amount for each wallet you want to fund."
        : "Enter a valid contribution amount for at least one member.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/wallets/contributions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          contributions,
          description,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to add contribution.");
      setEqualAmount("");
      setMemberAmounts({});
      await loadWallets(householdId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add contribution.");
    } finally {
      setPending(false);
    }
  }

  const contributionTotalPaise = contributionMode === "equal"
    ? (parsePaise(equalAmount) ?? 0) * (data?.wallets.length ?? 0)
    : (data?.wallets ?? []).reduce((total, wallet) => total + (parsePaise(memberAmounts[wallet.memberId] ?? "") ?? 0), 0);

  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Personal prepaid balance</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Wallet & ledger</h1></div>
        {households.length > 1 && <label className="text-xs font-medium text-slate-500">Household<select value={householdId} onChange={(event) => { setData(null); setLoading(true); setHouseholdId(event.target.value); }} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {viewLoading && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading wallet…</div>}
      {!viewLoading && households.length === 0 && <p className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Create a household to get a personal wallet.</p>}
      {data && loadedHouseholdId === householdId && !viewLoading && activeWallet && <>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-950 p-5 text-white sm:col-span-1"><div className="flex items-center justify-between"><p className="text-sm text-slate-300">{isAdmin ? activeWallet.memberName : "Available balance"}</p><WalletCards size={18} className="text-emerald-300" /></div><p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">{money(activeWallet.balancePaise)}</p><p className={`mt-3 text-xs ${activeWallet.balancePaise <= activeWallet.lowBalancePaise ? "text-amber-300" : "text-slate-400"}`}>{activeWallet.balancePaise <= activeWallet.lowBalancePaise ? "Low balance · ask an admin to add funds" : "Prepaid food wallet balance"}</p></div>
          <Metric title="Contributed this month" value={money(activeWallet.monthlyContributionsPaise)} icon={<ArrowUpRight size={17} />} />
          <Metric title="Food spent this month" value={money(activeWallet.monthlySpentPaise)} icon={<ArrowDownRight size={17} />} />
        </section>
        {isAdmin && <form onSubmit={addContribution} className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Add wallet funds</h2>
          <p className="mt-1 text-xs text-slate-500">Choose an equal credit for everyone or set a different amount for each member. Credits are recorded in the ledger.</p>
          <fieldset className="mt-4 flex flex-wrap gap-3">
            <legend className="sr-only">Contribution method</legend>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="radio" name="contributionMode" checked={contributionMode === "equal"} onChange={() => setContributionMode("equal")} />
              Same amount for everyone
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="radio" name="contributionMode" checked={contributionMode === "custom"} onChange={() => setContributionMode("custom")} />
              Different amount per member
            </label>
          </fieldset>
          {contributionMode === "equal" ? (
            <label className="mt-4 block max-w-sm text-sm font-medium text-slate-700">
              Amount per member
              <input inputMode="decimal" value={equalAmount} onChange={(event) => setEqualAmount(event.target.value)} required placeholder="e.g. 500" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600" />
            </label>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.wallets.map((wallet) => (
                <label key={wallet.memberId} className="block text-sm font-medium text-slate-700">
                  {wallet.memberName}
                  <input inputMode="decimal" value={memberAmounts[wallet.memberId] ?? ""} onChange={(event) => setMemberAmounts((current) => ({ ...current, [wallet.memberId]: event.target.value }))} placeholder="Amount ₹ (leave blank to skip)" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-600" />
                </label>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
            <input value={description} onChange={(event) => setDescription(event.target.value)} required minLength={2} maxLength={200} aria-label="Contribution description" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
            <button disabled={pending || contributionTotalPaise <= 0} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Add {money(contributionTotalPaise)} total</button>
          </div>
        </form>}
        <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Recent transactions</h2><p className="mt-1 text-xs text-slate-500">Ledger entries are append-only and never deleted.</p></div>
          {data.transactions.length ? <div className="divide-y divide-slate-100">{data.transactions.map((transaction) => {
            const credit = ["CONTRIBUTION", "MEAL_REFUND", "MANUAL_CREDIT", "ADJUSTMENT", "MONTHLY_OPENING_BALANCE"].includes(transaction.type);
            return <div key={transaction.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{transaction.memberName} · {transaction.type.toLowerCase().replaceAll("_", " ")} · {new Date(transaction.createdAt).toLocaleString()}</p></div>
              <p className={`shrink-0 text-sm font-semibold tabular-nums ${credit ? "text-emerald-700" : "text-slate-900"}`}>{credit ? "+" : "−"} {money(transaction.amountPaise)}</p>
            </div>;
          })}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">No wallet transactions yet.</p>}
        </section>
      </>}
    </div>
  </main>;
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-slate-500"><p className="text-sm">{title}</p>{icon}</div><p className="mt-5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p></article>;
}
