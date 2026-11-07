import type { Metadata } from "next";
import { PasswordPage } from "../dang-nhap/auth-panel";

export const metadata: Metadata = { title: "Kích hoạt tài khoản", referrer: "no-referrer" };

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string | string[] }>;
}) {
  return <PasswordPage token={(await searchParams).ma} kind="invite" />;
}
