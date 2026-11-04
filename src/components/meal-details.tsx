"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCcw } from "lucide-react";

type MealData = {
  meal: { id: string; householdId: string; name: string; category: string; totalPaise: number; description: string | null; eatenAt: string; cancelledAt: string | null; payerName: string };
  participants: Array<{ memberId: string; name: string; sharePaise: number }>;
  role: "ADMIN" | "MEMBER";
};
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function MealDetails({ mealId }: { mealId: string }) {
  const [data, setData] = useState<MealData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch(`/api/meals/${mealId}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load meal.");
    setData(result);
  }

  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const response = await fetch(`/api/meals/${mealId}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load meal.");
        if (active) setData(result);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load meal.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void run();
    return () => { active = false; };
  }, [mealId]);

  async function cancel() {
    if (!data || !window.confirm("Cancel this meal and refund every participant? This will add compensating ledger entries.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/households/${data.meal.householdId}/meals/${mealId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to cancel meal.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel meal.");
    } finally {
      setPending(false);
    }
  }

  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      {loading && <div className="flex min-h-56 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading meal…</div>}
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {data && <article className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">{data.meal.category.replaceAll("_", " ")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{data.meal.name}</h1><p className="mt-2 text-sm text-slate-300">{new Date(data.meal.eatenAt).toLocaleString()}</p></div>
            <p className="shrink-0 text-xl font-semibold">{money(data.meal.totalPaise)}</p>
          </div>
          {data.meal.cancelledAt && <p className="mt-5 inline-flex rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">Cancelled · participants refunded</p>}
        </div>
        <div className="p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><p className="text-xs text-slate-500">Paid by</p><p className="mt-1 text-sm font-medium">{data.meal.payerName}</p></div>
            <div><p className="text-xs text-slate-500">Participants</p><p className="mt-1 text-sm font-medium">{data.participants.length}</p></div>
          </div>
          {data.meal.description && <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">{data.meal.description}</p>}
          <div className="mt-7">
            <h2 className="text-sm font-semibold">Participant shares</h2>
            <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
              {data.participants.map((participant) => <div key={participant.memberId} className="flex items-center justify-between px-4 py-3.5"><span className="text-sm font-medium">{participant.name}</span><span className="text-sm font-semibold tabular-nums">{money(participant.sharePaise)}</span></div>)}
            </div>
          </div>
          {data.role === "ADMIN" && !data.meal.cancelledAt && <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/meals/${mealId}/edit`} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Edit meal</Link>
            <button onClick={cancel} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">{pending ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />} Cancel and refund</button>
          </div>}
        </div>
      </article>}
    </div>
  </main>;
}
