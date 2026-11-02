"use client";

import { useCallback, useEffect, useState } from "react";

import { pushApi } from "@/lib/api";

export type PushState = "unsupported" | "denied" | "off" | "on" | "working";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  // Registered on demand too, so notifications also work in development builds.
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

/** Notification permission and this browser's push subscription. */
export function usePush() {
  const [state, setState] = useState<PushState>("working");

  useEffect(() => {
    let cancelled = false;
    const settle = (next: PushState) => !cancelled && setState(next);
    if (!isSupported()) {
      Promise.resolve().then(() => settle("unsupported"));
    } else if (Notification.permission === "denied") {
      Promise.resolve().then(() => settle("denied"));
    } else {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.pushManager.getSubscription() ?? null)
        .then((sub) => settle(sub ? "on" : "off"))
        .catch(() => settle("off"));
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported()) return setState("unsupported");
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");

      const reg = await registration();
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
      await pushApi.subscribe(subscription.toJSON());
      setState("on");
    } catch (error) {
      setState("off");
      throw error;
    }
  }, []);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (error) {
      setState("on");
      throw error;
    }
  }, []);

  return { state, enable, disable };
}
