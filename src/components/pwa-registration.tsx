"use client";

import { useEffect, useState } from "react";

export function PwaRegistration({ householdId }: { householdId?: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const alreadyControlled = Boolean(navigator.serviceWorker?.controller);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Service worker registration failed.", error);
      });
    }
    const handleControllerChange = () => {
      if (alreadyControlled) setUpdateAvailable(true);
    };
    navigator.serviceWorker?.addEventListener("controllerchange", handleControllerChange);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstall);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function enableNotifications() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!householdId || !publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushMessage("Push notifications are not configured or supported in this browser.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage("Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, subscription: subscription.toJSON() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to enable push notifications.");
      setPushMessage("Push notifications are enabled for this device.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Unable to enable push notifications.");
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    {installPrompt && <button onClick={install} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Install app</button>}
    {updateAvailable && <button onClick={() => window.location.reload()} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Reload updated app</button>}
    {householdId && <button onClick={enableNotifications} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Enable notifications</button>}
    {pushMessage && <span role="status" className="w-full text-xs text-slate-500">{pushMessage}</span>}
  </div>;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
