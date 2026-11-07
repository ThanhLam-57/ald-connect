import Link from "next/link";
import type { ReactNode } from "react";
import { isAccountTokenValid, type AccountTokenKind } from "../../lib/auth-store";
import { PasswordForm } from "./auth-form";
import styles from "./auth.module.css";

export function AuthPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-labelledby="auth-title">
      <p className="page-kicker">ALD CONNECT</p>
      <h1 id="auth-title" className="page-title">{title}</h1>
      {children}
    </section>
  );
}

export function PasswordPage({ token, kind }: { token: string | string[] | undefined; kind: AccountTokenKind }) {
  const reset = kind === "reset";
  return (
    <AuthPanel title={reset ? "Đặt lại mật khẩu" : "Kích hoạt tài khoản"}>
      {typeof token === "string" && isAccountTokenValid(token, kind) ? (
        <>
          <p className="page-description">Đặt mật khẩu cá nhân từ 12 đến 128 ký tự.</p>
          <PasswordForm token={token} reset={reset} />
        </>
      ) : (
        <p className="page-description">
          Liên kết đã hết hạn, đã được dùng hoặc không còn hiệu lực. Hãy liên hệ người cấp tài khoản.
        </p>
      )}
      <Link href="/dang-nhap" className={styles.back}>Về trang đăng nhập</Link>
    </AuthPanel>
  );
}
