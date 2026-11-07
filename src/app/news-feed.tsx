import Link from "next/link";
import { RefreshOnLiveUpdates } from "./live-updates";
import type { Account } from "../lib/auth";
import { contentDate, listAnnouncements } from "../lib/content";
import { confirmAnnouncementRead } from "./ban-tin/actions";
import newsStyles from "./ban-tin/content.module.css";
import styles from "./home.module.css";

export function NewsFeed({ account }: { account: Account }) {
  const announcements = listAnnouncements(account);

  return (
    <section aria-labelledby="news-heading">
      <RefreshOnLiveUpdates topic="announcements" />
      <div className={styles.sectionHeading}>
        <h2 id="news-heading">Bản tin ALD</h2>
        {account.role === "HCNS" && <Link href="/ban-tin#publish-heading">Đăng thông báo</Link>}
      </div>
      <div className={`${styles.feed} ${newsStyles.feed}`}>
        {announcements.length === 0 && (
          <div className={styles.post}><p>Chưa có thông báo nội bộ.</p></div>
        )}
        {announcements.map((item) => (
          <article key={item.id} className={`${styles.post} ${newsStyles.article}`}>
            <header className={styles.postMeta}>
              <span className={`${styles.badge} ${styles.important}`}>Thông báo</span>
              <span>Hành chính nhân sự</span>
              <time dateTime={new Date(item.created_at).toISOString()}>{contentDate(item.created_at)}</time>
            </header>
            <h3>{item.title}</h3>
            <p className={newsStyles.body}>{item.body}</p>
            {account.role !== "LIVE" && (
              <p className={newsStyles.readCount}>{item.read_count} nhân viên đã xác nhận đọc</p>
            )}
            {account.role === "LIVE" && (
              <form action={confirmAnnouncementRead}>
                <input type="hidden" name="announcement" value={item.id} />
                <button className={styles.ack} type="submit" disabled={Boolean(item.acknowledged)}>
                  {item.acknowledged ? "✓ Đã xác nhận đọc" : "Xác nhận đã đọc"}
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
