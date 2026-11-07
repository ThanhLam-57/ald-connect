import { notFound } from "next/navigation";
import { requireActiveAccount } from "../../lib/auth";

export default async function RankingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const account = await requireActiveAccount();
  if (account.role === "HCNS") notFound();
  return children;
}
