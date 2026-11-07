import { createHash } from "node:crypto";

import type { Leaderboard, RankBranch, RankScope } from "../app/bang-xep-hang/ranking-data";
import { getDatabase, transaction } from "./database";

type RevenueItem = {
  staffCode: string;
  name: string;
  branches: RankBranch[];
  coins: bigint;
};

type Snapshot = {
  month: string;
  generatedAt: string;
  businessDate: string;
  branches: RankBranch[];
  items: RevenueItem[];
};

type CacheEntry = {
  nextAttemptAt: number;
  pending?: Promise<void>;
  snapshot: Snapshot | null;
  stale: boolean;
};

const businessDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const cache = new Map<string, CacheEntry>();
const unavailable = "Nguồn doanh số Workforce hiện không khả dụng.";

function workforceUrl() {
  const configuredOrigin = process.env.WORKFORCE_ORIGIN?.trim();
  if (!configuredOrigin) return null;
  const url = new URL("/api/integrations/v1/revenue-leaderboard/current", configuredOrigin);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error(unavailable);
  return url;
}

export function getWorkforceSource(): string | null {
  return workforceUrl()?.origin ?? null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && value.trim().length > 0;
}

function parseSnapshot(payload: unknown): Snapshot {
  if (!isObject(payload) || !isObject(payload.data)) throw new Error(unavailable);
  const data = payload.data;
  if (
    data.timezone !== "Asia/Ho_Chi_Minh" ||
    data.unit !== "COIN" ||
    typeof data.month !== "string" ||
    typeof data.generatedAt !== "string" ||
    !Array.isArray(data.items) ||
    data.totalEmployees !== data.items.length
  ) {
    throw new Error(unavailable);
  }

  const generatedAt = new Date(data.generatedAt);
  if (!Number.isFinite(generatedAt.getTime())) throw new Error(unavailable);
  const generatedBusinessDate = businessDate.format(generatedAt);
  if (data.month !== generatedBusinessDate.slice(0, 7)) throw new Error(unavailable);

  const branches = new Map<string, RankBranch>();
  const staffCodes = new Set<string>();
  const items: RevenueItem[] = [];
  for (const raw of data.items) {
    if (
      !isObject(raw) ||
      !isText(raw.staffCode, 30) ||
      staffCodes.has(raw.staffCode) ||
      !isText(raw.displayName, 120) ||
      typeof raw.revenue !== "string" ||
      !/^\d{1,30}$/.test(raw.revenue) ||
      !Array.isArray(raw.branches) ||
      raw.branches.length === 0
    ) {
      throw new Error(unavailable);
    }
    staffCodes.add(raw.staffCode);
    const assignments = new Map<string, RankBranch>();
    for (const branch of raw.branches) {
      if (!isObject(branch) || !isText(branch.code, 30) || !isText(branch.name, 120)) {
        throw new Error(unavailable);
      }
      const previous = branches.get(branch.code);
      if (previous && previous.name !== branch.name) throw new Error(unavailable);
      const entry = previous ?? { id: branch.code, name: branch.name };
      branches.set(entry.id, entry);
      assignments.set(entry.id, entry);
    }
    const coins = BigInt(raw.revenue);
    const previous = items.at(-1);
    if (previous && previous.coins < coins) throw new Error(unavailable);
    items.push({
      staffCode: raw.staffCode,
      name: raw.displayName === raw.staffCode ? "Nhân viên Live" : raw.displayName,
      branches: [...assignments.values()],
      coins,
    });
  }

  return {
    month: data.month,
    generatedAt: generatedAt.toISOString(),
    businessDate: generatedBusinessDate,
    branches: [...branches.values()].sort((left, right) => left.id.localeCompare(right.id, "vi")),
    items,
  };
}

async function refresh(entry: CacheEntry, url: URL, token: string) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const transient = response.status >= 500 || [408, 425, 429].includes(response.status);
      if (!transient) entry.snapshot = null;
      throw new Error(unavailable);
    }
    const snapshot = parseSnapshot(await response.json());
    if (snapshot.month !== businessDate.format(new Date()).slice(0, 7)) {
      entry.snapshot = null;
      throw new Error(unavailable);
    }
    transaction(() => {
      const saveBranch = getDatabase().prepare(`
        INSERT INTO workforce_branches (workforce_source, branch_code, branch_name) VALUES (?, ?, ?)
        ON CONFLICT (workforce_source, branch_code) DO UPDATE SET branch_name = excluded.branch_name
        WHERE workforce_branches.branch_name <> excluded.branch_name
      `);
      for (const branch of snapshot.branches) saveBranch.run(url.origin, branch.id, branch.name);
    });
    entry.snapshot = snapshot;
    entry.stale = false;
  } catch {
    entry.stale = true;
  }
}

async function readSnapshot(verify = false) {
  const url = workforceUrl();
  const token = process.env.ALD_REVENUE_API_TOKEN?.trim();
  if (!url || !token) throw new Error(unavailable);

  const key = createHash("sha256").update(url.href).update("\0").update(token).digest("hex");
  const entry = cache.get(key) ?? { nextAttemptAt: 0, snapshot: null, stale: false };
  cache.set(key, entry);

  const now = Date.now();
  if (!entry.pending && (verify || now >= entry.nextAttemptAt)) {
    entry.nextAttemptAt = now + 60_000;
    entry.pending = refresh(entry, url, token).finally(() => {
      entry.pending = undefined;
    });
  }
  await entry.pending;

  const snapshot = entry.snapshot;
  if (!snapshot || (verify && entry.stale) || snapshot.month !== businessDate.format(new Date()).slice(0, 7)) {
    throw new Error(unavailable);
  }

  return { snapshot, stale: entry.stale, source: url.origin };
}

export async function getWorkforceDirectory(verify = false) {
  const { snapshot, stale, source } = await readSnapshot(verify);
  if (stale) throw new Error(unavailable);
  return {
    source,
    branches: snapshot.branches,
    staff: snapshot.items.map(({ staffCode, name, branches }) => ({
      staffCode,
      displayName: name,
      branches,
    })),
  };
}

export async function readWorkforceLeaderboard(
  scope: RankScope,
  { branchId, staffCode, canChooseBranch = false }: {
    branchId: string | null;
    staffCode: string | null;
    canChooseBranch?: boolean;
  },
): Promise<{ data: Leaderboard; stale: boolean; branches?: RankBranch[] } | null> {
  const { snapshot, stale } = await readSnapshot();
  const positive = snapshot.items.filter((item) => item.coins > 0n);
  const selectedBranch = branchId ?? (canChooseBranch ? snapshot.branches[0]?.id : undefined);
  const branch =
    scope === "facility"
      ? snapshot.branches.find(({ id }) => id === selectedBranch) ?? null
      : null;
  if (scope === "facility" && !branch) return null;

  const relevant = positive.filter((item) => item.branches.some(({ id }) => id === branch?.id));
  const facilityCandidates = relevant.filter((item) => item.branches.length === 1);
  const thirdCoins = facilityCandidates[2]?.coins;
  const branchBreakdownUnavailable = relevant.some(
    (item) => item.branches.length > 1 && (thirdCoins === undefined || item.coins >= thirdCoins),
  );
  const selected = scope === "company"
    ? positive.slice(0, 10)
    : branchBreakdownUnavailable ? [] : facilityCandidates.slice(0, 3);
  const viewerRows = scope === "company"
    ? positive
    : relevant.length === facilityCandidates.length ? facilityCandidates : [];
  const viewerIndex = viewerRows.findIndex((item) => item.staffCode === staffCode);

  return {
    data: {
      scope,
      period: "month",
      asOf: snapshot.generatedAt,
      businessDate: snapshot.businessDate,
      branch,
      entries: selected.map((item, index) => ({
        rank: index + 1,
        name: item.name,
        branchName: branch?.name ?? item.branches.map(({ name }) => name).join(" · "),
        coins: item.coins.toString(),
      })),
      viewer: viewerIndex < 0 ? null : {
        rank: viewerIndex + 1,
        coins: viewerRows[viewerIndex].coins.toString(),
        nextCoins: viewerRows[viewerIndex - 1]?.coins.toString() ?? null,
      },
      ...(branchBreakdownUnavailable && { branchBreakdownUnavailable: true }),
    },
    stale,
    ...(canChooseBranch && scope === "facility" && { branches: snapshot.branches }),
  };
}
