"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_INTERVAL = 30_000;
const DIRECTORY_REFRESH_INTERVAL = 15_000;
const PRESENCE_URL = `${process.env.NEXT_PUBLIC_CONNECT_BASE_PATH ?? ""}/api/hien-dien`;

export function PresenceHeartbeat() {
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    let allowed = true;

    async function sendHeartbeat() {
      if (!allowed || pending) return;
      pending = true;
      try {
        const response = await fetch(PRESENCE_URL, {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (response.status === 401 || response.status === 403) allowed = false;
      } catch {
        // An interrupted request is retried at the next interval.
      } finally {
        pending = false;
      }
    }

    function resume() {
      if (!document.hidden) void sendHeartbeat();
    }

    void sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, POLL_INTERVAL);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return null;
}

export function RefreshPresenceDirectory() {
  const router = useRouter();
  useEffect(() => {
    function refresh() {
      if (!document.hidden) router.refresh();
    }
    const timer = window.setInterval(refresh, DIRECTORY_REFRESH_INTERVAL);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
