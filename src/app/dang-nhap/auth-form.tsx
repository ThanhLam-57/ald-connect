"use client";

import { useActionState } from "react";
import { activateAccount, resetPassword, signIn } from "./actions";
import styles from "./auth.module.css";

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form className={styles.form} action={action}>
      <label>
        Tên đăng nhập
        <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={48} required />
      </label>
      <label>
        Mật khẩu
        <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button disabled={pending}>{pending ? "Đang đăng nhập…" : "Đăng nhập"}</button>
    </form>
  );
}

export function PasswordForm({ token, reset }: { token: string; reset: boolean }) {
  const [error, action, pending] = useActionState(reset ? resetPassword : activateAccount, null);
  return (
    <form className={styles.form} action={action}>
      <input type="hidden" name="ma" value={token} />
      <label>
        Mật khẩu mới
        <input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      <label>
        Xác nhận mật khẩu
        <input name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <button disabled={pending}>{pending ? "Đang lưu…" : reset ? "Lưu mật khẩu mới" : "Kích hoạt tài khoản"}</button>
    </form>
  );
}
