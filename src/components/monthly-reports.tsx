"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";

type Household = { id: string; name: string };
type Report = {
  month: string;
  role: "ADMIN" | "MEMBER";
  members: Array<{ memberId: string; name: string; contributionsPaise: number; mealSpentPaise: number; transactionCount: number }>;
  totals: { walletContributionsPaise: number; mealSpentPaise: number; rationCollectedPaise: number; rationSpentPaise: number; mealCount: number; mealTotalPaise: number };
  meals: Array<{ id: string; category: string; totalPaise: number }>;
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const currentMonth = () => new Date().toISOString().slice(0, 7);

export function MonthlyReports() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/households");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load households.");
        if (active) {
          setHouseholds(result);
          setHouseholdId(result[0]?.id ?? "");
          if (!result.length) setLoading(false);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load households.");
          setLoading(false);
        }
      }
    }
    void loadHouseholds();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!householdId) return;
    let active = true;
    const key = `${householdId}:${month}`;
    async function load() {
      try {
        const response = await fetch(`/api/households/${householdId}/reports?month=${encodeURIComponent(month)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load report.");
        if (active) {
          setReport(result);
          setLoadedKey(key);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load report.");
          setLoadedKey(key);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [householdId, month]);

  const viewLoading = loading || (!!householdId && loadedKey !== `${householdId}:${month}`);
  const mealCategories = report?.meals.reduce<Record<string, number>>((totals, meal) => {
    totals[meal.category] = (totals[meal.category] ?? 0) + meal.totalPaise;
    return totals;
  }, {}) ?? {};

  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Household accounting</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Monthly report</h1></div>
        <div className="flex flex-wrap gap-3">
          {households.length > 1 && <select aria-label="Household" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {viewLoading && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Generating report…</div>}
      {!viewLoading && !households.length && <p className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Create or join a household to see a report.</p>}
      {report && loadedKey === `${householdId}:${month}` && !viewLoading && <>
        <p className="mt-2 text-sm text-slate-500">{new Date(`${report.month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} · {report.role === "ADMIN" ? "Household view" : "Personal view"}</p>
        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportCard title="Wallet contributions" value={money(report.totals.walletContributionsPaise)} />
          <ReportCard title="Net meal spending" value={money(report.totals.mealSpentPaise)} />
          <ReportCard title="Ration collected" value={money(report.totals.rationCollectedPaise)} />
          <ReportCard title="Ration purchases" value={money(report.totals.rationSpentPaise)} />
        </section>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Member summary</h2><p className="mt-1 text-xs text-slate-500">Includes ledger credits and meal debits/refunds for the selected period.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500"><tr><th className="px-5 py-3">Member</th><th className="px-4 py-3 text-right">Wallet credits</th><th className="px-4 py-3 text-right">Net meal spend</th><th className="px-5 py-3 text-right">Entries</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{report.members.map((member) => <tr key={member.memberId}><td className="px-5 py-3.5 font-medium">{member.name}</td><td className="px-4 py-3.5 text-right tabular-nums">{money(member.contributionsPaise)}</td><td className="px-4 py-3.5 text-right tabular-nums">{money(member.mealSpentPaise)}</td><td className="px-5 py-3.5 text-right text-slate-500">{member.transactionCount}</td></tr>)}</tbody>
            </table></div>
            {!report.members.length && <p className="px-5 py-10 text-center text-sm text-slate-500">No wallet activity in this period.</p>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold">Meal activity</h2>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-50 p-4"><span className="text-sm text-slate-600">Meals recorded</span><strong className="text-lg">{report.totals.mealCount}</strong></div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 p-4"><span className="text-sm text-slate-600">Meal totals</span><strong className="text-lg">{money(report.totals.mealTotalPaise)}</strong></div>
            <div className="mt-5 space-y-3">{Object.entries(mealCategories).map(([category, amount]) => <div key={category} className="flex items-center justify-between text-sm"><span className="text-slate-500">{category.toLowerCase().replaceAll("_", " ")}</span><span className="font-medium">{money(amount)}</span></div>)}</div>
          </section>
        </div>
      </>}
    </div>
  </main>;
}

function ReportCard({ title, value }: { title: string; value: string }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{title}</p><p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p></article>;
}
