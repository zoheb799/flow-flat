"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Users } from "lucide-react";

export function InvitationAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to accept this invitation.");
      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to accept this invitation.");
    } finally {
      setPending(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-5 py-12">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Users size={22} /></div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">You’re invited to a household</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Accept the invitation using the account registered to the invited email address.</p>
      {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      <button onClick={accept} disabled={pending} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending && <LoaderCircle size={16} className="animate-spin" />} Accept invitation
      </button>
      <p className="mt-4 text-xs leading-5 text-slate-400">Not signed in with the invited account? <Link href={`/login?callbackUrl=${encodeURIComponent(`/invitations/accept?token=${token}`)}`} className="font-medium text-emerald-800 hover:underline">Log in</Link></p>
    </section>
  </main>;
}
