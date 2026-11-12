"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { manageAccount } from "./actions";
import styles from "./page.module.css";

type Props = {
  intent: "create" | "role" | "link" | "manager" | "lock" | "unlock" | "invite" | "reset" | "revoke" | "unlink";
  accountId?: string;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  children?: ReactNode;
};

export function AccountActionForm({ intent, accountId, label, tone = "primary", children }: Props) {
  const [state, submit, pending] = useActionState(manageAccount, {});

  return (
    <form action={submit} className={styles.actionForm}>
      <input type="hidden" name="intent" value={intent} />
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      {children}
      <div>
        <button type="submit" className={`${styles.button} ${styles[tone]}`} disabled={pending}>
          {pending ? "Đang xử lý…" : label}
        </button>
      </div>
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      {state.message && <p className={styles.success} role="status">{state.message}</p>}
      {state.credentialPath && (
        <CredentialLink key={state.credentialPath} path={state.credentialPath} lifetime={state.credentialLifetime} />
      )}
    </form>
  );
}

function CredentialLink({ path, lifetime }: { path: string; lifetime?: string }) {
  const [url, setUrl] = useState(path);
  const [copyMessage, setCopyMessage] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(new URL(path, window.location.origin).href);
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyMessage("Đã sao chép đường dẫn.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setCopyMessage("Đường dẫn đã được chọn để bạn sao chép.");
    }
  }

  return (
    <div className={styles.credential}>
      <label className={styles.label}>
        <span>Đường dẫn dùng một lần</span>
        <input ref={field} value={url} readOnly spellCheck={false} />
      </label>
      <p>Gửi riêng đường dẫn cho người dùng. Đường dẫn có hiệu lực trong {lifetime} và chỉ xuất hiện ở đây.</p>
      <div><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={copy}>Sao chép đường dẫn</button></div>
      {copyMessage && <p role="status">{copyMessage}</p>}
    </div>
  );
}
