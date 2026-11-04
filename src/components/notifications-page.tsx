"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, LoaderCircle } from "lucide-react";

type Household = { id: string; name: string };
type Notification = { id: string; type: string; title: string; message: string; href: string | null; readAt: string | null; createdAt: string };

export function NotificationsPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedId, setLoadedId] = useState("");
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
    async function load() {
      try {
        const response = await fetch(`/api/households/${householdId}/notifications`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load notifications.");
        if (active) {
          setNotifications(result);
          setLoadedId(householdId);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load notifications.");
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
  async function markRead(id: string) {
    try {
      const response = await fetch(`/api/households/${householdId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to mark notification as read.");
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to mark notification as read.");
    }
  }

  return <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
      <div className="mt-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-slate-500">Updates from your household</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Notifications</h1></div>
        {households.length > 1 && <select aria-label="Household" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
      </div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {viewLoading && <div className="flex min-h-48 items-center justify-center text-sm text-slate-500"><LoaderCircle size={17} className="mr-2 animate-spin" /> Loading notifications…</div>}
      {!viewLoading && !households.length && <p className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Join a household to see your notifications.</p>}
      {!viewLoading && households.length > 0 && <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {notifications.length ? <div className="divide-y divide-slate-100">{notifications.map((item) => <article key={item.id} className={`flex gap-4 px-5 py-5 ${item.readAt ? "" : "bg-emerald-50/40"}`}>
          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${item.readAt ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-800"}`}><Bell size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p><time className="text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</time></div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.message}</p>
            <div className="mt-2 flex gap-4">{item.href && <Link href={item.href} className="text-xs font-semibold text-emerald-800 hover:underline">View details</Link>}{!item.readAt && <button onClick={() => markRead(item.id)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Mark read</button>}</div>
          </div>
        </article>)}</div> : <p className="px-5 py-12 text-center text-sm text-slate-500">You’re all caught up.</p>}
      </section>}
    </div>
  </main>;
}
