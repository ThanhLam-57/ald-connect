import Link from "next/link";
import { requireActiveAccount } from "../lib/auth";
import { NewsFeed } from "./news-feed";
import styles from "./home.module.css";

export default async function Home() {
  const account = await requireActiveAccount();
  const showRanking = account.role !== "HCNS";

  return (
    <>
      <section className={styles.hero} aria-labelledby="welcome">
        <div className={styles.heroContent}>
          <p className={styles.heroKicker}><span /> CHÀO MỪNG ĐẾN ALD CONNECT</p>
          <h1 id="welcome">Hôm nay ở ALD</h1>
          <p>Xem tin mới, ghi nhận đóng góp và gửi những điều bạn cần hỗ trợ.</p>
          <Link href="/cong-dong" className={styles.heroLink}>
            Mở bảng tin cộng đồng<span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><span>A<span>.</span></span></div>
      </section>

      <div className={styles.columns}>
        <NewsFeed account={account} />
        <aside className={styles.rail} aria-label="Lối tắt nội bộ">
          <div className={styles.railCard}>
            <div className={styles.railIcon} aria-hidden="true">↗</div>
            <h2>Góc hỗ trợ</h2>
            <p>{account.role === "ADMIN" ? "Xem các phiếu góp ý và tiến độ xử lý." : "Chọn chủ đề và theo dõi trao đổi với hành chính nhân sự."}</p>
            <Link href="/gop-y">Mở kênh góp ý <span aria-hidden="true">→</span></Link>
          </div>
          {showRanking && <div className={styles.railCard}>
            <div className={`${styles.railIcon} ${styles.rankIcon}`} aria-hidden="true">#</div>
            <h2>Thi đua doanh số</h2>
            <p>Hai bảng riêng cho cơ sở và toàn công ty.</p>
            <Link href="/bang-xep-hang/toan-ald">Xem BXH toàn ALD <span aria-hidden="true">→</span></Link>
          </div>}
        </aside>
      </div>
    </>
  );
}
