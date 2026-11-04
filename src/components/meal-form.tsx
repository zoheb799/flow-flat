"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, Users } from "lucide-react";
import { equalMealShares, weightedMealShares } from "@/lib/validation/meal";

type Household = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type Member = { id: string; name: string; balancePaise: number };
type DashboardPayload = { members: Member[] };
type SplitMode = "EQUAL" | "CUSTOM" | "PERCENTAGE" | "SHARES";
const currency = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

function parsePaise(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, fraction = ""] = value.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function percentBasisPoints(value: string) {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= 10_000 ? basisPoints : null;
}

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function MealForm({ mealId }: { mealId?: string }) {
  const router = useRouter();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("DINNER");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [eatenAt, setEatenAt] = useState(() => localDateTime(new Date().toISOString()));
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const householdResponse = await fetch("/api/households");
        const householdList: Household[] = await householdResponse.json();
        if (!householdResponse.ok) throw new Error("Unable to load your households.");

        let mealHouseholdId = householdList[0]?.id ?? "";
        if (mealId) {
          const mealResponse = await fetch(`/api/meals/${mealId}`);
          const result = await mealResponse.json();
          if (!mealResponse.ok) throw new Error(result.error ?? "Unable to load this meal.");
          if (result.role !== "ADMIN") throw new Error("Only household admins can edit meals.");
          if (result.meal.cancelledAt) throw new Error("A cancelled meal cannot be edited.");
          mealHouseholdId = result.meal.householdId;
          if (active) {
            setName(result.meal.name);
            setCategory(result.meal.category);
            setAmount((result.meal.totalPaise / 100).toFixed(2));
            setPayerId(result.meal.payerId);
            setParticipantIds(result.participants.map((participant: { memberId: string }) => participant.memberId));
            setSplitMode("CUSTOM");
            setSplitValues(Object.fromEntries(result.participants.map((participant: { memberId: string; sharePaise: number }) => [
              participant.memberId,
              (participant.sharePaise / 100).toFixed(2),
            ])));
            setEatenAt(localDateTime(result.meal.eatenAt));
            setDescription(result.meal.description ?? "");
          }
        }

        if (active) {
          setHouseholds(householdList);
          setHouseholdId(mealHouseholdId);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load meal form.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [mealId]);

  useEffect(() => {
    if (!householdId) return;
    let active = true;
    async function loadMembers() {
      try {
        const response = await fetch(`/api/households/${householdId}/dashboard`);
        const result: DashboardPayload & { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load household members.");
        if (active) {
          setMembers(result.members);
          setParticipantIds((current) => current.length ? current : result.members.map((member) => member.id));
          setPayerId((current) => result.members.some((member) => member.id === current) ? current : result.members[0]?.id ?? "");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load household members.");
      }
    }
    void loadMembers();
    return () => { active = false; };
  }, [householdId]);

  const totalPaise = parsePaise(amount);
  const shares = useMemo(() => {
    if (!totalPaise || !participantIds.length) return [];
    if (splitMode === "EQUAL") return equalMealShares(totalPaise, participantIds);
    if (splitMode === "CUSTOM") {
      const parsed = participantIds.map((memberId) => ({ memberId, sharePaise: parsePaise(splitValues[memberId] ?? "") }));
      if (parsed.some((item) => item.sharePaise === null)) return [];
      return parsed.map((item) => ({ memberId: item.memberId, sharePaise: item.sharePaise! }));
    }
    if (splitMode === "PERCENTAGE") {
      const percentages = participantIds.map((memberId) => ({ memberId, weight: percentBasisPoints(splitValues[memberId] ?? "") }));
      if (percentages.some((item) => item.weight === null) || percentages.reduce((sum, item) => sum + (item.weight ?? 0), 0) !== 10_000) return [];
      return weightedMealShares(totalPaise, percentages.map((item) => ({ memberId: item.memberId, weight: item.weight! })));
    }
    const weights = participantIds.map((memberId) => ({ memberId, weight: /^\d{1,6}$/.test(splitValues[memberId] ?? "") ? Number(splitValues[memberId]) : null }));
    if (weights.some((item) => !item.weight)) return [];
    return weightedMealShares(totalPaise, weights.map((item) => ({ memberId: item.memberId, weight: item.weight! })));
  }, [participantIds, splitMode, splitValues, totalPaise]);

  const shareTotal = shares.reduce((sum, share) => sum + share.sharePaise, 0);
  const validShares = !!totalPaise && shares.length === participantIds.length && shareTotal === totalPaise;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!householdId || !totalPaise || participantIds.length === 0 || !payerId || !validShares) {
      setError("Enter a valid amount, select participants, and make sure shares equal the total.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(mealId ? `/api/households/${householdId}/meals/${mealId}` : "/api/meals", {
        method: mealId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          name,
          category,
          totalPaise,
          payerId,
          participants: shares,
          description: description || undefined,
          eatenAt: new Date(eatenAt).toISOString(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Unable to ${mealId ? "update" : "record"} this meal.`);
      setSuccess(mealId ? "Meal updated and wallet differences recorded." : "Meal recorded and participant wallets updated.");
      setTimeout(() => router.push(mealId ? `/meals/${result.id}` : "/dashboard"), 700);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save this meal.");
    } finally {
      setPending(false);
    }
  }

  function toggleParticipant(id: string) {
    setParticipantIds((selected) => selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  function selectHousehold(id: string) {
    setParticipantIds([]);
    setSplitValues({});
    setHouseholdId(id);
  }

  return (
    <main className="min-h-screen bg-[#f7f8f6] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={16} /> Back to overview</Link>
        <div className="mt-7">
          <p className="text-sm text-slate-500">Household expenses</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{mealId ? "Edit meal" : "Record a meal"}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Only the selected participants are charged. Every wallet change is recorded in the ledger.</p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-sm font-semibold">Expense details</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Meal name
                <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="e.g. Chicken biryani" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10" />
              </label>
              <label className="text-sm font-medium text-slate-700">Household
                <select value={householdId} onChange={(event) => selectHousehold(event.target.value)} disabled={!!mealId} required className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-600 disabled:bg-slate-100">
                  {households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-600">
                  <option value="BREAKFAST">Breakfast</option><option value="LUNCH">Lunch</option><option value="DINNER">Dinner</option><option value="SNACKS">Snacks</option><option value="TEA_COFFEE">Tea & coffee</option><option value="GROCERIES">Groceries</option><option value="OTHER">Other</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Total amount (₹)
                <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required placeholder="0.00" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-emerald-600" />
              </label>
              <label className="text-sm font-medium text-slate-700">Paid by
                <select value={payerId} onChange={(event) => setPayerId(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-600">
                  {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Date and time
                <input type="datetime-local" value={eatenAt} onChange={(event) => setEatenAt(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-emerald-600" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Note <span className="font-normal text-slate-400">(optional)</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={2} placeholder="Add a note for the household" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-emerald-600" />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-sm font-semibold">Who shared this meal?</h2><p className="mt-1 text-xs text-slate-500">Unselected wallets will not be charged.</p></div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"><Users size={13} /> {participantIds.length} selected</span>
            </div>
            <label className="mt-4 block max-w-xs text-xs font-medium text-slate-500">Split method
              <select value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">
                <option value="EQUAL">Equal split</option><option value="CUSTOM">Custom amounts</option><option value="PERCENTAGE">Percentage split</option><option value="SHARES">Share-based split</option>
              </select>
            </label>
            <div className="mt-4 divide-y divide-slate-100">
              {members.map((member) => {
                const selected = participantIds.includes(member.id);
                const share = shares.find((item) => item.memberId === member.id)?.sharePaise;
                return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={selected} onChange={() => toggleParticipant(member.id)} className="size-4 rounded border-slate-300 accent-emerald-700" />
                    <span className="truncate text-sm font-medium">{member.name}</span>
                  </label>
                  <div className="flex items-center gap-4">
                    <span className="text-right text-xs text-slate-500">Balance {currency(member.balancePaise)}{share !== undefined && <span className="mt-1 block font-medium text-slate-800">{currency(share)} share</span>}</span>
                    {selected && splitMode !== "EQUAL" && <label className="sr-only">{splitMode === "CUSTOM" ? "Share amount" : splitMode === "PERCENTAGE" ? "Share percentage" : "Share count"} for {member.name}</label>}
                    {selected && splitMode !== "EQUAL" && <input
                      inputMode={splitMode === "SHARES" ? "numeric" : "decimal"}
                      value={splitValues[member.id] ?? ""}
                      onChange={(event) => setSplitValues((current) => ({ ...current, [member.id]: event.target.value }))}
                      placeholder={splitMode === "CUSTOM" ? "₹ amount" : splitMode === "PERCENTAGE" ? "%" : "shares"}
                      className="w-24 rounded-lg border border-slate-300 px-2.5 py-2 text-right text-sm outline-none focus:border-emerald-600"
                    />}
                  </div>
                </div>;
              })}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div><p className="text-xs text-slate-500">{splitMode === "PERCENTAGE" ? "Percentages must total 100%" : splitMode === "SHARES" ? "Shares are allocated proportionally" : splitMode === "CUSTOM" ? "Custom shares must total the expense" : `Equal split · ${participantIds.length} participants`}</p><p className="mt-1 text-sm font-semibold">{totalPaise ? currency(totalPaise) : "Enter an amount"}</p></div>
              <p className={`text-right text-xs ${validShares ? "text-emerald-700" : "text-amber-700"}`}>{validShares ? "Shares match total" : "Shares incomplete"}<span className="mt-1 block text-sm font-semibold">{shares.length ? currency(shareTotal) : "—"}</span></p>
            </div>
          </section>

          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
          {success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
          <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
            <Link href={mealId ? `/meals/${mealId}` : "/dashboard"} className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</Link>
            <button disabled={pending || loading || members.length === 0 || !validShares} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
              {pending && <LoaderCircle size={16} className="animate-spin" />} {mealId ? "Save meal changes" : "Confirm and record meal"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
