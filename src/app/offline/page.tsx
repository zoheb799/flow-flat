import Link from "next/link";

export default function OfflinePage() {
  return <main className="grid min-h-screen place-items-center bg-[#f7f8f6] p-6 text-center">
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">You’re offline</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">FlatFlow doesn’t store household or financial data in the offline cache. Reconnect to load your private dashboard.</p>
      <Link href="/dashboard" className="mt-6 inline-flex rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Try again</Link>
    </div>
  </main>;
}
