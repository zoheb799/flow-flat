import Link from "next/link";
import { ArrowRight, Check, Shield, WalletCards } from "lucide-react";

const benefits = [
  "Separate personal wallets and shared household funds",
  "Every meal is split only across the people who joined",
  "A clear ledger for contributions, charges, and refunds",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8f6] text-slate-950">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-700 text-white">
            <WalletCards size={19} />
          </span>
          <span className="text-lg">FlatFlow</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white">
            Log in
          </Link>
          <Link href="/register" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800">
            Get started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-32 lg:pt-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Shared expenses, without the awkward math
          </div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.08] tracking-[-0.045em] sm:text-6xl">
            A calmer way to manage the shared <span className="text-emerald-700">everyday.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Keep meal wallets and common household spending in one clear place. Everyone sees what matters, and every rupee has a record.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-emerald-800">
              Create your account <ArrowRight size={17} />
            </Link>
            <span className="text-sm text-slate-500">Free for your household</span>
          </div>
          <div className="mt-11 flex flex-col gap-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3 text-sm text-slate-600">
                <span className="grid size-5 place-items-center rounded-full bg-emerald-100 text-emerald-800"><Check size={13} strokeWidth={3} /></span>
                {benefit}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[500px]">
          <div className="absolute -left-8 top-12 size-40 rounded-full bg-emerald-200/50 blur-3xl" />
          <div className="relative rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_30px_90px_-40px_rgba(15,23,42,.35)] sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">HOUSEHOLD OVERVIEW</p>
                <h2 className="mt-1 text-lg font-semibold">Your flat, in balance</h2>
              </div>
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Shield size={19} /></span>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-950 p-5 text-white">
              <p className="text-sm text-slate-300">Personal wallet</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">₹ 2,450.00</p>
              <div className="mt-5 h-1.5 rounded-full bg-white/15">
                <div className="h-full w-[68%] rounded-full bg-emerald-400" />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-400"><span>Monthly budget</span><span>68% remaining</span></div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5">
                <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-700">🍲</span><div><p className="text-sm font-medium">Dinner · shared</p><p className="text-xs text-slate-500">You and 2 others</p></div></div>
                <span className="text-sm font-semibold text-slate-800">− ₹180</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5">
                <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700">↗</span><div><p className="text-sm font-medium">Monthly contribution</p><p className="text-xs text-slate-500">Added to your wallet</p></div></div>
                <span className="text-sm font-semibold text-emerald-700">+ ₹500</span>
              </div>
            </div>
            <p className="mt-5 text-center text-[11px] text-slate-400">Illustrative preview · your household data stays private</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/80 px-6 py-6 text-center text-xs text-slate-500">
        FlatFlow · Thoughtful tools for living together
      </footer>
    </main>
  );
}
