"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { ArrowLeft, LoaderCircle, WalletCards } from "lucide-react";

const countries = [
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+1", name: "United States / Canada", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+971", name: "United Arab Emirates", flag: "🇦🇪" },
  { code: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+65", name: "Singapore", flag: "🇸🇬" },
  { code: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "+977", name: "Nepal", flag: "🇳🇵" },
  { code: "+94", name: "Sri Lanka", flag: "🇱🇰" },
];

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [mobileNumber, setMobileNumber] = useState("");

  useEffect(() => {
    if (!otpSent || secondsRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [otpSent, secondsRemaining]);

  async function requestOtp(enteredCountryCode: string, enteredMobileNumber: string) {
    setError("");
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: enteredCountryCode, mobileNumber: enteredMobileNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to send an OTP.");
      setCountryCode(enteredCountryCode);
      setMobileNumber(enteredMobileNumber);
      setPhone(`${enteredCountryCode}${enteredMobileNumber}`);
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
    await requestOtp(
      String(formData.get("countryCode") ?? countryCode),
      String(formData.get("mobileNumber") ?? mobileNumber),
    );
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
          body: JSON.stringify({ name, countryCode, mobileNumber, otp }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to create your account.");
        if (result.existing) setMessage("Your account is already set up. Signing you in…");
      }

      const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
      let safeCallback = "/dashboard";
      if (callbackUrl) {
        const destination = new URL(callbackUrl, window.location.origin);
        if (destination.origin === window.location.origin) {
          safeCallback = `${destination.pathname}${destination.search}${destination.hash}`;
        }
      }
      const result = await signIn("credentials", {
        phone,
        otp,
        redirect: false,
        redirectTo: safeCallback,
      });
      if (!result?.ok || result.error) {
        if (result?.error === "CredentialsSignin") {
          throw new Error("Sign-in failed. Check that this phone number has an account and that the OTP is correct and unexpired.");
        }
        throw new Error("Unable to sign in. Please try again.");
      }
      window.location.href = new URL(safeCallback, window.location.origin).href;
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
                <input name="name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" placeholder="e.g. zohaib uddin" />
              </label>
            )}
            {!otpSent ? (
              <label className="block text-sm font-medium text-slate-700">
                Phone number
                <span className="mt-1.5 flex gap-2">
                  <select name="countryCode" autoComplete="tel-country-code" aria-label="Country calling code" required value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="w-36 rounded-lg border border-slate-300 bg-white px-2 py-3 font-normal outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10">
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>{country.flag} {country.name} ({country.code})</option>
                    ))}
                  </select>
                  <input name="mobileNumber" type="tel" inputMode="numeric" autoComplete="tel-national" aria-label="10-digit mobile number" required pattern="[0-9]{10}" minLength={10} maxLength={10} value={mobileNumber} onChange={(event) => setMobileNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" placeholder="9876543210" />
                </span>
                <span className="mt-1 block text-xs font-normal text-slate-500">India (+91) is selected by default. Choose your country and enter exactly 10 mobile digits.</span>
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
          {otpSent && <button type="button" onClick={() => void requestOtp(countryCode, mobileNumber)} disabled={pending || secondsRemaining > 0} className="mt-3 w-full text-center text-sm font-medium text-emerald-800 hover:underline disabled:cursor-not-allowed disabled:text-slate-400">Resend OTP{secondsRemaining > 0 ? ` in ${formatCountdown(secondsRemaining)}` : ""}</button>}
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
