import type { Metadata } from "next";
import { requireActiveAccount } from "../../../lib/auth";
import { RankBoard } from "../rank-board";

export const metadata: Metadata = {
  title: "Bảng xếp hạng cơ sở",
};

export default async function FacilityRankingPage() {
  const account = await requireActiveAccount();
  return <RankBoard scope="facility" canChooseBranch={account.role === "ADMIN"} />;
}
