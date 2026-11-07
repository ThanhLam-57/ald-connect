import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasWorkforceLink } from "../../lib/accounts";
import { requireAccount } from "../../lib/auth";
import styles from "../tai-khoan/page.module.css";

export const metadata: Metadata = { title: "Chờ liên kết Workforce" };

export default async function PendingLinkPage() {
  const account = await requireAccount();
  if (account.role !== "LIVE" || hasWorkforceLink(account)) redirect("/");

  return (
    <section className={`${styles.panel} ${styles.pendingPage}`} aria-labelledby="pending-heading">
      <p className="page-kicker">ALD CONNECT / TÀI KHOẢN LIVE</p>
      <h1 id="pending-heading" className="page-title">Chờ liên kết Workforce</h1>
      <p className="page-description">
        Tài khoản <strong>{account.username}</strong> cần được Admin gắn với mã nhân viên và cơ sở đang công tác. Vui lòng liên hệ Admin và đăng nhập lại sau khi được xác nhận.
      </p>
    </section>
  );
}
