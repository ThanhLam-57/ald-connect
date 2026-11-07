import { requireActiveAccount } from "../../lib/auth";
import feedbackStyles from "../gop-y/page.module.css";
import { NewsFeed } from "../news-feed";
import { submitAnnouncement } from "./actions";

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const account = await requireActiveAccount();
  const { notice } = await searchParams;

  return (
    <div className={feedbackStyles.page}>
      <header>
        <p className="page-kicker">THÔNG TIN NỘI BỘ</p>
        <h1 className="page-title">Thông báo</h1>
        <p className="page-description">Theo dõi thông tin mới từ HCNS và xác nhận đã đọc.</p>
      </header>
      {account.role === "HCNS" && (
        <section className={feedbackStyles.card} aria-labelledby="publish-heading">
          <div className={feedbackStyles.cardHeading}>
            <div>
              <h2 id="publish-heading">Đăng thông báo mới</h2>
              <p>Thông báo sẽ xuất hiện trên bản tin nội bộ của ALD Connect.</p>
            </div>
          </div>
          {notice === "published" && (
            <p className={feedbackStyles.receipt} role="status">Đã đăng thông báo.</p>
          )}
          {notice === "invalid" && (
            <p className={feedbackStyles.notice} role="alert">Kiểm tra lại tiêu đề và nội dung trước khi đăng.</p>
          )}
          <form className={feedbackStyles.form} action={submitAnnouncement}>
            <label className={feedbackStyles.inputLabel}>
              <span className={feedbackStyles.label}>Tiêu đề thông báo</span>
              <input className={feedbackStyles.input} name="title" maxLength={120} required />
            </label>
            <label className={feedbackStyles.inputLabel}>
              <span className={feedbackStyles.label}>Nội dung thông báo</span>
              <textarea className={feedbackStyles.input} name="body" maxLength={5000} rows={5} required />
            </label>
            <div className={feedbackStyles.actions}>
              <button className={feedbackStyles.primary} type="submit">Đăng thông báo</button>
            </div>
          </form>
        </section>
      )}
      <NewsFeed account={account} />
    </div>
  );
}
