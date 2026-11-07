"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { LiveTopic } from "../lib/live-updates";

const COALESCE_MS = 160;
const WATCH_INTERVAL_MS = 5_000;
const REOPEN_AFTER_MS = 10_000;
const STALE_AFTER_MS = 35_000;

export function useLiveUpdates(
  topic: LiveTopic,
  onUpdate: () => void,
  { fallbackIntervalMs = 20_000 }: { fallbackIntervalMs?: number } = {},
): { connected: boolean } {
  const notify = useEffectEvent(onUpdate);
  const [connectedTopic, setConnectedTopic] = useState<LiveTopic | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let updateTimer: number | undefined;
    let watchdog: number | undefined;
    let refreshRequired = false;
    let lastSignal = Date.now();
    let lastUpdate = lastSignal;
    let lastOpen = 0;
    let connected = false;
    let ended = false;

    function markConnected(value: boolean) {
      if (connected === value) return;
      connected = value;
      setConnectedTopic(value ? topic : null);
    }

    function queueUpdate(required = true) {
      if (ended || document.hidden || !navigator.onLine) return;
      refreshRequired ||= required;
      if (updateTimer !== undefined) return;

      updateTimer = window.setTimeout(() => {
        updateTimer = undefined;
        const shouldRefresh = refreshRequired || !connected;
        refreshRequired = false;
        if (ended || document.hidden || !navigator.onLine || !shouldRefresh) return;
        lastUpdate = Date.now();
        notify();
      }, COALESCE_MS);
    }

    function disconnect() {
      source?.close();
      source = null;
      markConnected(false);
    }

    function connect() {
      if (ended || document.hidden || !navigator.onLine || typeof EventSource === "undefined") return;
      lastOpen = Date.now();
      lastSignal = lastOpen;

      const basePath = process.env.NEXT_PUBLIC_CONNECT_BASE_PATH ?? "";
      let current: EventSource;
      try {
        current = new EventSource(basePath + "/api/cap-nhat?topic=" + topic);
      } catch {
        return;
      }
      source = current;

      function signal() {
        if (source !== current) return;
        lastSignal = Date.now();
        markConnected(true);
      }

      current.addEventListener("open", signal);
      current.addEventListener("pulse", signal);
      current.addEventListener("update", () => {
        if (source !== current) return;
        signal();
        queueUpdate();
      });
      current.addEventListener("error", () => {
        if (source === current) markConnected(false);
      });
      current.addEventListener("session-ended", () => {
        if (source !== current) return;
        ended = true;
        stopWatching();
        window.location.reload();
      });
    }

    function checkConnection() {
      if (ended || document.hidden || !navigator.onLine) return;
      const now = Date.now();
      if (source && (source.readyState === EventSource.CLOSED || now - lastSignal > STALE_AFTER_MS)) {
        disconnect();
      }
      if (!source && now - lastOpen >= REOPEN_AFTER_MS) connect();
      if (!connected && fallbackIntervalMs > 0 && now - lastUpdate >= fallbackIntervalMs) queueUpdate(false);
    }

    function stopWatching() {
      disconnect();
      window.clearTimeout(updateTimer);
      window.clearInterval(watchdog);
      updateTimer = undefined;
      watchdog = undefined;
      refreshRequired = false;
    }

    function handleVisibility() {
      if (document.hidden || !navigator.onLine || ended) {
        stopWatching();
        return;
      }
      if (!source) connect();
      if (watchdog === undefined) watchdog = window.setInterval(checkConnection, WATCH_INTERVAL_MS);
      queueUpdate();
    }

    if (!document.hidden && navigator.onLine) {
      connect();
      watchdog = window.setInterval(checkConnection, WATCH_INTERVAL_MS);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleVisibility);
    window.addEventListener("offline", handleVisibility);

    return () => {
      ended = true;
      source?.close();
      window.clearTimeout(updateTimer);
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleVisibility);
      window.removeEventListener("offline", handleVisibility);
    };
  }, [topic, fallbackIntervalMs]);

  return { connected: connectedTopic === topic };
}

export function RefreshOnLiveUpdates({ topic }: { topic: LiveTopic }) {
  const router = useRouter();
  useLiveUpdates(topic, () => startTransition(() => router.refresh()));
  return null;
}
