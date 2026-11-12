import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getAccount, logout } from "../lib/auth";
import { Navigation } from "./navigation";
import { PresenceHeartbeat } from "./presence-heartbeat";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ALD Connect", template: "%s | ALD Connect" },
  description: "Kênh nội bộ của ALD.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { viewportFit: "cover", interactiveWidget: "resizes-content" };

function Wordmark({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link href="/" className={mobile ? "wordmark mobile-wordmark" : "wordmark"} aria-label="ALD Connect · Trang chủ">
      <span className="brand-mark" aria-hidden="true">A<span>.</span></span>
      <span>ALD<span className="wordmark-accent"> Connect</span><small>KÊNH NỘI BỘ</small></span>
    </Link>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const account = await getAccount();
  const pending = account?.role === "LIVE" && (!account.staffCode || !account.branchCode || !account.workforceSource);
  const roleLabel = account && (account.role === "LIVE" && account.isBranchManager
    ? "Quản lý cơ sở"
    : { ADMIN: "Admin", HCNS: "Hành chính nhân sự", LIVE: "Nhân viên Live" }[account.role]);
  const showNavigation = Boolean(account && !pending);

  return (
    <html lang="vi">
      <body>
        {account && !pending && <PresenceHeartbeat />}
        <div className="workspace" data-has-navigation={showNavigation}>
          <aside className="sidebar">
            <Wordmark />
            {account && showNavigation && <Navigation role={account.role} isBranchManager={account.isBranchManager} />}
          </aside>

          <div className="work-area">
            <header className="topbar">
              <Wordmark mobile />
              <span className="demo-label">
                <span className="account-dot" aria-hidden="true" />
                {account ? <span className="account-label">{account.displayName}<span className="account-role"> · {roleLabel}</span></span> : <span className="account-label">Kênh nội bộ ALD</span>}
              </span>
              {account && <form action={logout} className="view-switch">
                <button type="submit">Đăng xuất</button>
              </form>}
            </header>
            <main className="content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
