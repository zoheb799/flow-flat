"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";

type Household = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type AuditEntry = { id: string; action: string; resourceType: string; resourceId: string | null; details: Record<string, unknown>; createdAt: string; actorName: string };

export function AuditLogPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loadedId, setLoadedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadHouseholds() {
      try {
        const response = await fetch("/api/households");
        const result: Household[] = await response.json();
        if (!response.ok) throw new Error("Unable to load households.");
        if (active) {
          setHouseholds(result);
          setHouseholdId(result.find((item) => item.role === "ADMIN")?.id ?? "");
          if (!result.some((item) => item.role === "ADMIN")) setLoading(false);
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
    async function load() {
      try {
        const response = await fetch(`/api/households/${householdId}/audit-logs`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load audit log.");
        if (active) {
          setEntries(result);
          setLoadedId(householdId);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load audit log.");
          setLoadedId(householdId);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [householdId]);

  const viewLoading = loading || (!!householdId && loadedId !== householdId);
  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-5xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Administrator tools</p><h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><ShieldCheck size={25} className="text-emerald-700" /> Audit log</h1></div>
        {households.filter((item) => item.role === "ADMIN").length > 1 && <select aria-label="Household" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{households.filter((item) => item.role === "ADMIN").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {viewLoading && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading audit history…</div>}
      {!viewLoading && !householdId && <p className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Audit history is available to household admins.</p>}
      {!viewLoading && householdId && <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {entries.length ? <div className="divide-y divide-slate-100">{entries.map((entry) => <article key={entry.id} className="px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold">{entry.action.replaceAll("_", " ").toLowerCase()}</p><p className="mt-1 text-xs text-slate-500">{entry.actorName} · {entry.resourceType.toLowerCase()} {entry.resourceId ? `· ${entry.resourceId}` : ""}</p></div><time className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</time></div>
          <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">Details</summary><pre className="mt-2 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px]">{JSON.stringify(entry.details, null, 2)}</pre></details>
        </article>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">No administrative activity recorded yet.</p>}
      </section>}
    </div>
  </main>;
}
