import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAccount } from "../../lib/auth";
import { LoginForm } from "./auth-form";
import { AuthPanel } from "./auth-panel";
import styles from "./auth.module.css";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ "mat-khau"?: string | string[] }>;
}) {
  if (await getAccount()) redirect("/");
  const passwordSaved = (await searchParams)["mat-khau"] === "da-luu";
  return (
    <AuthPanel title="Đăng nhập">
      <p className="page-description">Dùng tài khoản cá nhân được cấp cho ALD Connect.</p>
      {passwordSaved && <p className={styles.notice} role="status">Đã lưu mật khẩu. Bạn có thể đăng nhập.</p>}
      <LoginForm />
      <p className={styles.help}>Cần cấp tài khoản hoặc đặt lại mật khẩu? Hãy liên hệ HCNS hoặc quản trị viên.</p>
    </AuthPanel>
  );
}
