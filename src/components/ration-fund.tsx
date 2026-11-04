"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, Plus, ShoppingBasket } from "lucide-react";

type Household = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type RationData = {
  period: { startsAt: string; endsAt: string };
  members: Array<{ id: string; name: string }>;
  totals: { collectedPaise: number; spentPaise: number; balancePaise: number };
  contributions: Array<{ id: string; memberId: string; name: string; amountPaise: number; createdAt: string }>;
  expenses: Array<{ id: string; category: string; amountPaise: number; description: string; purchaserName: string; purchasedAt: string; receiptUrl: string | null }>;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

function parsePaise(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export function RationFund() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [data, setData] = useState<RationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedHouseholdId, setLoadedHouseholdId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [memberId, setMemberId] = useState("");
  const [contributionAmount, setContributionAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("RICE");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [purchasedBy, setPurchasedBy] = useState("");

  const loadData = useCallback(async (id: string) => {
    const response = await fetch(`/api/households/${id}/ration`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load common fund.");
    setData(result);
    setLoadedHouseholdId(id);
    setMemberId((current) => result.members.some((item: RationData["members"][number]) => item.id === current) ? current : result.members[0]?.id ?? "");
    setPurchasedBy((current) => result.members.some((item: RationData["members"][number]) => item.id === current) ? current : result.members[0]?.id ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/households");
        const result: Household[] = await response.json();
        if (!response.ok) throw new Error("Unable to load your households.");
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
        const response = await fetch(`/api/households/${householdId}/ration`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load common fund.");
        if (active) {
          setData(result);
          setLoadedHouseholdId(householdId);
          setMemberId((current) => result.members.some((item: RationData["members"][number]) => item.id === current) ? current : result.members[0]?.id ?? "");
          setPurchasedBy((current) => result.members.some((item: RationData["members"][number]) => item.id === current) ? current : result.members[0]?.id ?? "");
          setError("");
        }
      } catch (caught) {
        if (active) {
          setLoadedHouseholdId(householdId);
          setError(caught instanceof Error ? caught.message : "Unable to load common fund.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [householdId]);

  const activeHousehold = households.find((item) => item.id === householdId);
  const isAdmin = activeHousehold?.role === "ADMIN";
  const viewLoading = loading || (!!householdId && loadedHouseholdId !== householdId);

  async function submitContribution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = parsePaise(contributionAmount);
    if (!amountPaise || !memberId) {
      setError("Enter a valid contribution and choose a member.");
      return;
    }
    const saved = await submitRecord("contributions", {
      memberId,
      amountPaise,
      idempotencyKey: crypto.randomUUID(),
    });
    if (saved) setContributionAmount("");
  }

  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = parsePaise(expenseAmount);
    if (!amountPaise || !purchasedBy) {
      setError("Enter a valid purchase amount and choose who paid.");
      return;
    }
    const saved = await submitRecord("expenses", {
      category: expenseCategory,
      amountPaise,
      description: expenseDescription,
      purchasedBy,
      purchasedAt: new Date().toISOString(),
      idempotencyKey: crypto.randomUUID(),
    });
    if (saved) {
      setExpenseAmount("");
      setExpenseDescription("");
    }
  }

  async function submitRecord(path: "contributions" | "expenses", payload: Record<string, unknown>) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/households/${householdId}/ration/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save record.");
      await loadData(householdId);
      setMessage(path === "contributions" ? "Contribution recorded." : "Purchase recorded.");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save record.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Shared household spending</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Common ration fund</h1></div>
        {households.length > 1 && <label className="text-xs font-medium text-slate-500">Household<select value={householdId} onChange={(event) => setHouseholdId(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
      {viewLoading && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading common fund…</div>}
      {!viewLoading && households.length === 0 && <p className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Create a household before tracking a common fund.</p>}
      {data && loadedHouseholdId === householdId && !viewLoading && <>
        <p className="mt-2 text-sm text-slate-500">Period {new Date(data.period.startsAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <FundCard title="Available balance" value={money(data.totals.balancePaise)} emphasis />
          <FundCard title="Collected" value={money(data.totals.collectedPaise)} />
          <FundCard title="Purchases" value={money(data.totals.spentPaise)} />
        </section>
        {isAdmin && <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <form onSubmit={submitContribution} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Record a contribution</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select value={memberId} onChange={(event) => setMemberId(event.target.value)} required className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
              <input inputMode="decimal" value={contributionAmount} onChange={(event) => setContributionAmount(event.target.value)} required placeholder="Amount ₹" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
            </div>
            <button disabled={pending || !data.members.length} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus size={15} /> Add to fund</button>
          </form>
          <form onSubmit={submitExpense} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Record a ration purchase</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">
                <option value="RICE">Rice</option><option value="WHEAT">Wheat</option><option value="OIL">Oil</option><option value="VEGETABLES">Vegetables</option><option value="FRUITS">Fruits</option><option value="MILK">Milk</option><option value="EGGS">Eggs</option><option value="SPICES">Spices</option><option value="CLEANING">Cleaning supplies</option><option value="OTHER">Other</option>
              </select>
              <input inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required placeholder="Amount ₹" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600" />
              <input value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} required maxLength={500} placeholder="What was purchased?" className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 sm:col-span-2" />
              <select value={purchasedBy} onChange={(event) => setPurchasedBy(event.target.value)} required className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm sm:col-span-2">{data.members.map((member) => <option key={member.id} value={member.id}>Purchased by {member.name}</option>)}</select>
            </div>
            <button disabled={pending || !data.members.length} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"><ShoppingBasket size={15} /> Record purchase</button>
          </form>
        </section>}
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <RecordList title="Contributions" empty="No contributions recorded this month." items={data.contributions.map((item) => ({ id: item.id, title: item.name, subtitle: new Date(item.createdAt).toLocaleDateString(), amountPaise: item.amountPaise, positive: true }))} />
          <RecordList title="Purchase history" empty="No common purchases recorded this month." items={data.expenses.map((item) => ({ id: item.id, title: item.description, subtitle: `${item.category.toLowerCase()} · ${item.purchaserName}`, amountPaise: item.amountPaise, positive: false }))} />
        </section>
      </>}
    </div>
  </main>;
}

function FundCard({ title, value, emphasis = false }: { title: string; value: string; emphasis?: boolean }) {
  return <article className={`rounded-xl border p-5 ${emphasis ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}><p className="text-sm text-slate-500">{title}</p><p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p></article>;
}

function RecordList({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; subtitle: string; amountPaise: number; positive: boolean }> }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2></div>
    {items.length ? <div className="divide-y divide-slate-100">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5"><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.subtitle}</p></div><p className={`shrink-0 text-sm font-semibold ${item.positive ? "text-emerald-700" : "text-slate-900"}`}>{item.positive ? "+" : "−"} {money(item.amountPaise)}</p></div>)}</div> : <p className="px-5 py-8 text-center text-sm text-slate-500">{empty}</p>}
  </section>;
}
