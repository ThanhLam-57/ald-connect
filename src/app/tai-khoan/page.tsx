import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageAccounts, hasWorkforceLink, listAccountAudit, listManagedAccounts, roleLabels } from "../../lib/accounts";
import { requireActiveAccount } from "../../lib/auth";
import { getWorkforceDirectory } from "../../lib/workforce";
import { AccountActionForm } from "./account-action-form";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Quản lý tài khoản" };

type SearchParams = Promise<{ taiKhoan?: string | string[]; nhanSu?: string | string[] }>;
type ManagedAccount = ReturnType<typeof listManagedAccounts>[number];

const roles = Object.entries(roleLabels);
const auditLabels: Record<string, string> = {
  account_created: "Tạo tài khoản",
  account_locked: "Khóa tài khoản",
  account_unlocked: "Mở khóa tài khoản",
  role_changed: "Đổi vai trò",
  workforce_link_changed: "Đổi liên kết Workforce",
  workforce_link_removed: "Bỏ liên kết Workforce",
  activation_issued: "Cấp đường dẫn kích hoạt",
  reset_issued: "Cấp đường dẫn đặt lại mật khẩu",
  credentials_revoked: "Thu hồi phiên và đường dẫn",
  bootstrap_admin: "Khởi tạo Admin",
  reissue_admin_invite: "Cấp lại đường dẫn kích hoạt Admin",
  community_post_hidden: "Ẩn bài viết cộng đồng",
  community_comment_hidden: "Ẩn bình luận cộng đồng",
  community_post_unhidden: "Hiện lại bài viết cộng đồng",
  community_comment_unhidden: "Hiện lại bình luận cộng đồng",
  admin_review_chat: "Xem cuộc trò chuyện",
  admin_review_feedback: "Xem phiếu góp ý",
  admin_review_community: "Xem danh tính trong Cộng đồng",
};
const auditTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
});

function accountStatus(account: ManagedAccount) {
  if (account.disabled) return { label: "Đã khóa", tone: "disabled" };
  if (!account.hasPassword) return { label: "Chờ kích hoạt", tone: "pending" };
  if (account.role === "LIVE" && !hasWorkforceLink(account)) return { label: "Chờ gắn Workforce", tone: "pending" };
  return { label: "Đang hoạt động", tone: "active" };
}

function Status({ account }: { account: ManagedAccount }) {
  const status = accountStatus(account);
  return <span className={styles.status} data-tone={status.tone}>{status.label}</span>;
}

function searchKey(value: string) {
  return value.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d");
}

function RoleField({ current }: { current: ManagedAccount["role"] }) {
  return (
    <label className={styles.label}>
      <span>Vai trò</span>
      <select name="role" defaultValue={current} required>
        {roles.map(([role, label]) => <option value={role} key={role}>{label}</option>)}
      </select>
    </label>
  );
}

async function WorkforceLink({ account, query }: { account: ManagedAccount; query: string }) {
  let directory;
  let unavailable = false;
  if (query) {
    try {
      directory = await getWorkforceDirectory();
    } catch {
      unavailable = true;
    }
  }

  const key = searchKey(query);
  const matches = directory?.staff.filter((staff) => (
    searchKey(staff.staffCode).includes(key) || searchKey(staff.displayName).includes(key)
  )).slice(0, 15) ?? [];
  const currentBranch = directory?.branches.find((branch) => branch.id === account.branchCode)?.name ?? account.branchCode;

  return (
    <section className={styles.detailsSection} aria-labelledby="workforce-link-heading">
      <h3 id="workforce-link-heading">Liên kết Workforce</h3>
      {hasWorkforceLink(account) ? (
        <p>Mã nhân viên <strong>{account.staffCode}</strong> · Cơ sở <strong>{currentBranch}</strong></p>
      ) : <p>Tài khoản chưa được gắn mã nhân viên và cơ sở.</p>}
      <form method="get" className={styles.searchForm}>
        <input type="hidden" name="taiKhoan" value={account.id} />
        <label className={styles.label}>
          <span>Tìm theo mã hoặc tên nhân viên</span>
          <input name="nhanSu" type="search" maxLength={100} defaultValue={query} placeholder="Ví dụ: ALD001 hoặc Nguyễn An" required />
        </label>
        <button type="submit" className={`${styles.button} ${styles.secondary}`}>Tìm trong Workforce</button>
      </form>
      {unavailable && <p className={styles.error} role="alert">Chưa tải được danh sách Workforce. Vui lòng thử lại.</p>}
      {directory && !matches.length && <p role="status">Không tìm thấy nhân viên phù hợp trong nguồn Workforce hiện tại.</p>}
      {directory && matches.length > 0 && (
        <AccountActionForm intent="link" accountId={account.id} label="Lưu liên kết" key={query}>
          <input type="hidden" name="source" value={directory.source} />
          <div className={styles.fields}>
            <label className={styles.label}>
              <span>Nhân viên Workforce</span>
              <select name="staffCode" defaultValue="" required>
                <option value="" disabled>Chọn nhân viên</option>
                {matches.map((staff) => (
                  <option key={staff.staffCode} value={staff.staffCode}>
                    {staff.staffCode} · {staff.displayName} · {staff.branches.map((branch) => branch.name).join(", ") || "Chưa ghi nhận cơ sở"}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.label}>
              <span>Cơ sở đang công tác</span>
              <select name="branchCode" defaultValue={directory.branches.some((branch) => branch.id === account.branchCode) ? account.branchCode ?? "" : ""} required>
                <option value="" disabled>Chọn cơ sở</option>
                {directory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          </div>
          <p className={styles.hint}>Thay đổi liên kết sẽ thu hồi phiên đăng nhập và đường dẫn kích hoạt hoặc đặt lại đã cấp.</p>
        </AccountActionForm>
      )}
      {hasWorkforceLink(account) && (
        <AccountActionForm intent="unlink" accountId={account.id} label="Bỏ liên kết Workforce" tone="danger">
          <p className={styles.hint}>Bỏ liên kết sẽ xóa mật khẩu và thu hồi các phiên đăng nhập. Với tài khoản đã có lịch sử, có thể khóa tài khoản để dừng truy cập.</p>
        </AccountActionForm>
      )}
    </section>
  );
}

function AccountAudit({ events }: { events: ReturnType<typeof listAccountAudit> }) {
  return (
    <section className={styles.detailsSection} aria-labelledby="audit-heading">
      <h3 id="audit-heading">Nhật ký tài khoản</h3>
      {events.length ? (
        <ul className={styles.auditList}>
          {events.map((event) => (
            <li key={event.id}>
              <strong>{auditLabels[event.action] ?? event.action}</strong>
              <span>{event.actor ?? "Hệ thống"} · {auditTime.format(event.createdAt)}</span>
              {event.details !== "{}" && (
                <details>
                  <summary>Chi tiết thay đổi</summary>
                  <pre>{JSON.stringify(JSON.parse(event.details), null, 2)}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : <p>Chưa có thao tác được ghi nhận.</p>}
    </section>
  );
}

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requireActiveAccount();
  if (!canManageAccounts(actor)) redirect("/");

  const accounts = listManagedAccounts(actor);
  const params = await searchParams;
  const selected = accounts.find((account) => account.id === params.taiKhoan);
  const query = typeof params.nhanSu === "string" ? params.nhanSu.trim().slice(0, 100) : "";
  const admin = actor.role === "ADMIN";
  const audit = admin && selected ? listAccountAudit(actor, selected.id) : [];

  return (
    <>
      <header>
        <p className="page-kicker">ALD CONNECT / QUẢN LÝ TRUY CẬP</p>
        <h1 className="page-title">Quản lý tài khoản</h1>
        <p className="page-description">
          {admin ? "Tạo tài khoản, cấp quyền và gắn nhân viên với dữ liệu Workforce." : "Kích hoạt, khóa hoặc mở khóa tài khoản Live đã liên kết Workforce."}
        </p>
      </header>

      {admin && (
        <section className={`${styles.panel} ${styles.create}`} aria-labelledby="create-heading">
          <h2 id="create-heading">Tạo tài khoản</h2>
          <AccountActionForm intent="create" label="Tạo tài khoản">
            <div className={styles.fields}>
              <label className={styles.label}>
                <span>Tên đăng nhập</span>
                <input name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={48} pattern="[A-Za-z0-9._\-]{3,48}" placeholder="nguyen.an" required />
              </label>
              <label className={styles.label}>
                <span>Tên hiển thị</span>
                <input name="displayName" autoComplete="off" maxLength={120} placeholder="Nguyễn An" required />
              </label>
              <RoleField current="LIVE" />
            </div>
          </AccountActionForm>
        </section>
      )}

      <div className={styles.grid}>
        <section className={styles.panel} aria-labelledby="accounts-heading">
          <h2 id="accounts-heading">Danh sách tài khoản <small>{accounts.length}</small></h2>
          {accounts.length ? (
            <ul className={styles.accountList}>
              {accounts.map((account) => (
                <li key={account.id}>
                  <Link href={{ pathname: "/tai-khoan", query: { taiKhoan: account.id } }} aria-current={selected?.id === account.id ? "page" : undefined}>
                    <span>
                      <strong>{account.displayName}</strong>
                      <small>{account.username} · {roleLabels[account.role]}</small>
                    </span>
                    <Status account={account} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p>Chưa có tài khoản trong phạm vi quản lý.</p>}
        </section>

        {selected ? (
          <section className={styles.panel} key={selected.id} aria-labelledby="account-heading">
            <div className={styles.detailHeader}>
              <div>
                <h2 id="account-heading">{selected.displayName}</h2>
                <p>{selected.username} · {roleLabels[selected.role]}</p>
              </div>
              <Status account={selected} />
            </div>

            {admin && (
              <section className={styles.detailsSection} aria-labelledby="role-heading">
                <h3 id="role-heading">Phân quyền</h3>
                <AccountActionForm intent="role" accountId={selected.id} label="Lưu vai trò">
                  <RoleField current={selected.role} key={selected.role} />
                </AccountActionForm>
              </section>
            )}
            {admin && <WorkforceLink account={selected} query={query} />}

            <section className={styles.detailsSection} aria-labelledby="login-heading">
              <h3 id="login-heading">Truy cập và mật khẩu</h3>
              {!selected.disabled && !selected.hasPassword && (
                <AccountActionForm key={`invite:${selected.updatedAt}`} intent="invite" accountId={selected.id} label="Cấp đường dẫn kích hoạt" />
              )}
              {!selected.disabled && selected.hasPassword !== 0 && admin && (
                <AccountActionForm key={`reset:${selected.updatedAt}`} intent="reset" accountId={selected.id} label="Cấp đường dẫn đặt lại mật khẩu" tone="secondary" />
              )}
              {admin && (
                <AccountActionForm intent="revoke" accountId={selected.id} label="Thu hồi phiên và đường dẫn" tone="secondary" />
              )}
              <AccountActionForm
                intent={selected.disabled ? "unlock" : "lock"}
                accountId={selected.id}
                label={selected.disabled ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                tone={selected.disabled ? "secondary" : "danger"}
              />
            </section>
            {admin && <AccountAudit events={audit} />}
          </section>
        ) : <div className={`${styles.panel} ${styles.empty}`}>Chọn tài khoản để xem các thao tác được phép.</div>}
      </div>
    </>
  );
}
