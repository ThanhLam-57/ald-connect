import type { Metadata } from "next";
import { PasswordPage } from "../dang-nhap/auth-panel";

export const metadata: Metadata = { title: "Đặt lại mật khẩu", referrer: "no-referrer" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ ma?: string | string[] }>;
}) {
  return <PasswordPage token={(await searchParams).ma} kind="reset" />;
}
