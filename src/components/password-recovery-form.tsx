"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle } from "lucide-react";

export function PasswordRecoveryForm({ token }: { token?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const body = token
      ? { token, password: String(formData.get("password") ?? "") }
      : { email: String(formData.get("email") ?? "") };
    try {
      const response = await fetch(token ? "/api/auth/reset-password" : "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to complete this request.");
      setMessage(result.message ?? "Password updated. Please log in again.");
      if (token) setTimeout(() => router.push("/login"), 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to complete this request.");
    } finally {
      setPending(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-5 py-12">
    <div className="w-full max-w-[420px]">
      <Link href="/login" className="mb-9 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to login</Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-2xl font-semibold tracking-tight">{token ? "Choose a new password" : "Reset your password"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{token ? "Your new password must be at least 12 characters." : "We’ll email a one-time reset link if an account matches your address."}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {token
            ? <label className="block text-sm font-medium text-slate-700">New password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none focus:border-emerald-600" /></label>
            : <label className="block text-sm font-medium text-slate-700">Email address<input name="email" type="email" required maxLength={254} autoComplete="email" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none focus:border-emerald-600" /></label>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{message}</p>}
          <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            {pending && <LoaderCircle size={16} className="animate-spin" />}{token ? "Update password" : "Send reset link"}
          </button>
        </form>
      </section>
    </div>
  </main>;
}
