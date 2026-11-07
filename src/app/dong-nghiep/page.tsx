import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionToken } from "../../lib/auth";
import { getPresenceDirectory } from "../../lib/presence";
import { RefreshPresenceDirectory } from "../presence-heartbeat";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Đồng nghiệp" };

export default async function ColleaguesPage() {
  const directory = getPresenceDirectory(await getSessionToken());
  if (directory.status === 401) redirect("/dang-nhap");
  if (directory.status === 403) redirect("/cho-gan");
  const { colleagues } = directory;
  const onlineCount = colleagues.filter((colleague) => colleague.online).length;

  return (
    <section className={styles.directory} aria-labelledby="directory-title">
      <RefreshPresenceDirectory />
      <header>
        <p className="page-kicker">KÊNH NỘI BỘ</p>
        <h1 className="page-title" id="directory-title">Đồng nghiệp</h1>
        <p className="page-description">Xem cơ sở công tác và ai đang online trên ALD Connect.</p>
        <p className={styles.summary}>
          <strong>{onlineCount} đang online</strong>
          <span>{colleagues.length} đồng nghiệp</span>
        </p>
      </header>

      {colleagues.length === 0 ? (
        <p className={styles.empty}>Chưa có đồng nghiệp đã kích hoạt trong danh sách.</p>
      ) : (
        <ul className={styles.list} aria-label="Danh sách đồng nghiệp">
          {colleagues.map((colleague) => (
            <li key={colleague.id} className={styles.row}>
              <div className={styles.person}>
                <strong>
                  {colleague.displayName}
                  {colleague.self && <span className={styles.self}>Bạn</span>}
                </strong>
                <span>{colleague.branch ?? "Chưa xác định cơ sở"}</span>
              </div>
              <span className={styles.status} data-online={colleague.online}>
                {colleague.online ? "Đang online" : "Ngoại tuyến"}
              </span>
              {colleague.canMessage && (
                <Link
                  href={{ pathname: "/tin-nhan", query: { nguoi: colleague.id } }}
                  className={styles.message}
                  aria-label={`Nhắn tin cho ${colleague.displayName}`}
                >
                  Nhắn tin
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
