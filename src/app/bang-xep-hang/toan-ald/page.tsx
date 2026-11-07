import type { Metadata } from "next";
import { RankBoard } from "../rank-board";

export const metadata: Metadata = {
  title: "Bảng xếp hạng toàn ALD",
};

export default function CompanyRankingPage() {
  return <RankBoard scope="company" />;
}
