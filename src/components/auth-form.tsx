"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, LoaderCircle, WalletCards } from "lucide-react";

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!otpSent || secondsRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpSent, secondsRemaining]);

  async function requestOtp(enteredPhone: string) {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: enteredPhone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to send an OTP.");
      setPhone(enteredPhone);
      setOtpSent(true);
      setSecondsRemaining(60);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send an OTP.");
    } finally {
      setPending(false);
    }
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setName(String(formData.get("name") ?? name));
    await requestOtp(String(formData.get("phone") ?? phone));
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const otp = String(formData.get("otp") ?? "");

    try {
      if (mode === "register") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, phone, otp }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to create your account.");
        if (result.existing) setMessage("Your account is already set up. Signing you in…");
      }

      const result = await signIn("credentials", { phone, otp, redirect: false });
      if (!result?.ok) throw new Error("Phone number or OTP is incorrect.");
      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      let safeCallback = "/dashboard";
      if (callbackUrl) {
        const destination = new URL(callbackUrl, window.location.origin);
        if (destination.origin === window.location.origin) {
          safeCallback = `${destination.pathname}${destination.search}${destination.hash}`;
        }
      }
      router.push(safeCallback);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-5 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/" className="mb-9 inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900">
          <ArrowLeft size={16} /> Back to FlatFlow
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="mb-7 grid size-11 place-items-center rounded-xl bg-emerald-700 text-white"><WalletCards size={21} /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {mode === "login" ? "Sign in with your phone number and a one-time passcode." : "Create your account with your phone number."}
          </p>
          <form onSubmit={otpSent ? verifyOtp : sendOtp} className="mt-7 space-y-4">
            {!otpSent && mode === "register" && (
              <label className="block text-sm font-medium text-slate-700">
                Your name
                <input name="name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" placeholder="e.g. Aanya Sharma" />
              </label>
            )}
            {!otpSent ? (
              <label className="block text-sm font-medium text-slate-700">
                Phone number
                <input name="phone" type="tel" autoComplete="tel" required minLength={8} maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" placeholder="+91 98765 43210" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Indian 10-digit numbers are also accepted.</span>
              </label>
            ) : (
              <>
                <p className="rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-700">
                  OTP for <span className="font-semibold">{phone}</span>
                  <button type="button" onClick={() => { setOtpSent(false); setSecondsRemaining(0); setMessage(""); setError(""); }} className="ml-2 font-semibold text-emerald-800 hover:underline">Change</button>
                </p>
                <label className="block text-sm font-medium text-slate-700">
                  Six-digit OTP
                  <input name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal tracking-[.25em] outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" placeholder="••••••" />
                </label>
              </>
            )}
            {message && <p role="status" className="rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800">{message}</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-700">{error}</p>}
            {otpSent && <p role="status" aria-live="polite" className={`text-center text-sm ${secondsRemaining > 0 ? "text-slate-500" : "font-medium text-red-700"}`}>
              {secondsRemaining > 0
                ? `OTP expires in ${formatCountdown(secondsRemaining)}`
                : "OTP expired. Request a new one to continue."}
            </p>}
            <button disabled={pending || (otpSent && secondsRemaining === 0)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
              {pending && <LoaderCircle size={16} className="animate-spin" />}
              {!otpSent ? "Send OTP" : secondsRemaining === 0 ? "OTP expired" : mode === "login" ? "Verify and log in" : "Verify and create account"}
            </button>
          </form>
          {otpSent && <button type="button" onClick={() => void requestOtp(phone)} disabled={pending || secondsRemaining > 0} className="mt-3 w-full text-center text-sm font-medium text-emerald-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">Resend OTP{secondsRemaining > 0 ? ` in ${formatCountdown(secondsRemaining)}` : ""}</button>}
          <p className="mt-6 text-center text-sm text-slate-500">
            {mode === "login" ? "New to FlatFlow?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/register" : "/login"} className="font-semibold text-emerald-800 hover:underline">
              {mode === "login" ? "Create an account" : "Log in"}
            </Link>
          </p>
        </section>
        <p className="mt-5 text-center text-xs leading-5 text-slate-400">Your household finances are private and accessible only to its members.</p>
      </div>
    </main>
  );
}
