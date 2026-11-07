export type RankScope = "facility" | "company";

export type RankBranch = { id: string; name: string };
export type RankEntry = { rank: number; name: string; branchName: string; coins: string };
export type RankViewer =
  | { inTop: true; coins: string; rank: number; nextCoins: string | null }
  | { inTop: false; coins: string | null; coinsToTop: string | null };

export type Leaderboard = {
  scope: RankScope;
  period: "month";
  asOf: string;
  businessDate: string;
  branch: RankBranch | null;
  branchBreakdownUnavailable?: boolean;
  entries: RankEntry[];
  viewer: RankViewer | null;
};
