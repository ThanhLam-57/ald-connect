import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireActiveAccount } from "../../lib/auth";
import { listBranchAccounts, listBranchAnnouncementReads, managedBranch, type BranchAccount } from "../../lib/branch";
import { readBranchRoster } from "../../lib/workforce";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Cơ sở của tôi" };

const coinFormat = new Intl.NumberFormat("vi-VN");
const timeFormat = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short",
});

function accountState(account: BranchAccount | undefined) {
  if (!account) return { label: "Chưa có tài khoản", tone: "none" };
  if (account.disabled) return { label: "Đã khóa", tone: "disabled" };
  if (!account.hasPassword) return { label: "Chờ kích hoạt", tone: "pending" };
  return { label: "Đang hoạt động", tone: "active" };
}

export default async function MyBranchPage() {
  const account = await requireActiveAccount();
  const branch = managedBranch(account);
  if (!branch) notFound();

  const accounts = new Map(listBranchAccounts(account).map((item) => [item.staffCode, item]));
  const announcements = listBranchAnnouncementReads(account);
  let roster = null;
  try {
    roster = await readBranchRoster(branch.branchCode, branch.source);
  } catch {
    roster = null;
  }

  const activeCount = [...accounts.values()].filter((item) => !item.disabled && item.hasPassword).length;

  return (
    <div className={styles.page}>
      <header>
        <p className="page-kicker">QUẢN LÝ CƠ SỞ</p>
        <h1 className="page-title">{roster?.branch.name ?? "Cơ sở của tôi"}</h1>
        <p className="page-description">
          Nhân viên, doanh số xu tháng này và tình trạng xác nhận thông báo của cơ sở bạn quản lý. Bạn chỉ xem được cơ sở này.
        </p>
      </header>

      <section className={styles.panel} aria-labelledby="staff-heading">
        <h2 id="staff-heading">Nhân viên và doanh số <small>{roster?.staff.length ?? 0}</small></h2>
        {roster ? (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Nhân viên</th>
                    <th scope="col" className={styles.number}>Xu tháng này</th>
                    <th scope="col">Tài khoản ALD Connect</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.staff.map((member) => {
                    const state = accountState(accounts.get(member.staffCode));
                    return (
                      <tr key={member.staffCode}>
                        <td><strong>{member.name}</strong><small>{member.staffCode}</small></td>
                        <td className={styles.number}>
                          {member.coins === null
                            ? <span className={styles.muted} title="Nhân viên làm nhiều cơ sở, Workforce không tách số xu theo cơ sở">Chưa tách được</span>
                            : coinFormat.format(BigInt(member.coins))}
                        </td>
                        <td><span className={styles.status} data-tone={state.tone}>{state.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              Số liệu Workforce lúc {timeFormat.format(new Date(roster.asOf))}
              {roster.stale ? " (chậm cập nhật, đang hiển thị số liệu gần nhất)" : ""}. {activeCount} tài khoản đang hoạt động.
            </p>
          </>
        ) : (
          <p className={styles.muted} role="status">Chưa lấy được danh sách và doanh số từ Workforce. Vui lòng thử lại sau.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="reads-heading">
        <h2 id="reads-heading">Xác nhận đọc thông báo</h2>
        {announcements.length ? (
          <ul className={styles.reads}>
            {announcements.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{timeFormat.format(item.createdAt)}</small>
                </span>
                <span className={styles.readCount}>{item.confirmed}/{item.total} nhân viên</span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.muted}>Chưa có thông báo nào.</p>}
        <p className={styles.note}>Chỉ tính các tài khoản đang hoạt động của cơ sở.</p>
      </section>
    </div>
  );
}
