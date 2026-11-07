"use client";

import { useEffect, useState } from "react";
import type { Leaderboard, RankBranch, RankScope } from "./ranking-data";

type LoadStatus = "ready" | "sign-in" | "forbidden" | "unavailable";
type Snapshot = {
  query: string;
  status: LoadStatus;
  data?: Leaderboard;
  branches?: RankBranch[];
};

export function useLeaderboard(
  endpoint: string,
  scope: RankScope,
  branchId?: string,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams({ scope, period: "month" });
  if (scope === "facility" && branchId) params.set("branchId", branchId);
  const query = params.toString();

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      let status: LoadStatus = "unavailable";
      let data: Leaderboard | undefined;
      let branches: RankBranch[] | undefined;
      try {
        const response = await fetch(`${endpoint}?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) {
          const result = (await response.json()) as { data: Leaderboard; stale?: boolean; branches?: RankBranch[] };
          data = result.data;
          branches = result.branches;
          status = result.stale ? "unavailable" : "ready";
        } else if (response.status === 401) {
          status = "sign-in";
        } else if (response.status === 403) {
          status = "forbidden";
        }
      } catch {
        // The server decides when the last Workforce snapshot is still usable.
      }
      if (controller.signal.aborted) return;

      setSnapshot((previous) => ({ query, status, data, branches: branches ?? previous?.branches }));
      if (status === "ready" || status === "unavailable") timer = setTimeout(load, 60_000);
    }

    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt, endpoint, query]);

  return {
    current: snapshot?.query === query ? snapshot : undefined,
    branches: snapshot?.branches,
    retry: () => setAttempt((value) => value + 1),
  };
}
