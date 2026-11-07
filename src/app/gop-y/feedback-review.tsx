import Link from "next/link";
import { recordAdminReview } from "../../lib/admin-review";
import type { Account } from "../../lib/auth";
import {
  contentDate,
  getFeedbackForReview,
  isContentId,
  listFeedbackForReview,
  ticketStatuses,
} from "../../lib/content";
import { categoryLabel, ticketLabel } from "./labels";
import styles from "./page.module.css";

const reviewPath = "/gop-y";

type ReviewSearchParams = {
  ticket?: string | string[];
  notice?: string | string[];
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
};

export function FeedbackReview({ account, params }: { account: Account; params: ReviewSearchParams }) {
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const status = typeof params.status === "string" && Object.hasOwn(ticketStatuses, params.status)
    ? params.status as keyof typeof ticketStatuses
    : "";
  const page = typeof params.page === "string" && /^[1-9]\d{0,5}$/.test(params.page)
    ? Number(params.page)
    : 1;
  const requestedTicket = params.ticket;
  const review = isContentId(requestedTicket) ? getFeedbackForReview(account, requestedTicket) : null;
  if (review) recordAdminReview(account, "feedback", review.ticket.id);
  const listing = review ? null : listFeedbackForReview(account, { query, status, page });

  function href(nextPage: number, ticketId?: string) {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (status) search.set("status", status);
    if (nextPage > 1) search.set("page", String(nextPage));
    if (ticketId) search.set("ticket", ticketId);
    return reviewPath + (search.size ? "?" + search.toString() : "");
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p className="page-kicker">GIÁM SÁT NỘI BỘ</p>
        <h1 className="page-title">Góp ý & hỗ trợ</h1>
        <p className="page-description">Xem các phiếu và lịch sử trao đổi với HCNS ở chế độ chỉ xem.</p>
      </header>
      {requestedTicket !== undefined && !review && (
        <p className={styles.notice} role="alert">Không tìm thấy phiếu được chọn.</p>
      )}

      {review ? (
        <section className={styles.card} aria-labelledby="review-detail-heading">
          <div className={styles.reviewHeading}>
            <Link href={href(page)} className={styles.secondary}>← Về danh sách</Link>
            <span className={styles.status} data-status={review.ticket.status}>{ticketStatuses[review.ticket.status]}</span>
          </div>
          <div className={styles.cardHeading}>
            <div>
              <span className={styles.categoryTag}>{categoryLabel(review.ticket.category)}</span>
              <h2 id="review-detail-heading">{review.ticket.title}</h2>
              <p>{ticketLabel(review.ticket.id)}</p>
            </div>
          </div>
          <dl className={styles.reviewMetadata}>
            <div><dt>Người gửi</dt><dd>{review.ticket.senderName}</dd></div>
            <div><dt>HCNS phụ trách</dt><dd>{review.ticket.assigneeName ?? "Chưa có người phụ trách"}</dd></div>
            <div><dt>Thời gian gửi</dt><dd>{contentDate(review.ticket.created_at)}</dd></div>
            <div><dt>Cập nhật gần nhất</dt><dd>{contentDate(review.ticket.updated_at)}</dd></div>
          </dl>
          <h3 className={styles.historyHeading}>Lịch sử trao đổi</h3>
          <ol className={styles.messages}>
            {review.messages.map((message) => (
              <li className={styles.response} key={message.id}>
                <strong>{message.authorName}</strong>
                <time className={styles.messageTime} dateTime={new Date(message.created_at).toISOString()}>
                  {contentDate(message.created_at)}
                </time>
                <p className={styles.caseMessage}>{message.body}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : listing && (
        <section className={styles.card} aria-labelledby="review-list-heading">
          <div className={styles.cardHeading}>
            <div>
              <h2 id="review-list-heading">Tất cả phiếu</h2>
              <p>Chọn một phiếu để xem chi tiết và người đang phụ trách.</p>
            </div>
          </div>
          <form method="get" className={styles.reviewSearch}>
            <label>
              <span className={styles.label}>Tìm phiếu</span>
              <input name="q" type="search" defaultValue={query} maxLength={120}
                className={styles.input} placeholder="Tiêu đề hoặc mã phiếu" />
            </label>
            <label>
              <span className={styles.label}>Trạng thái</span>
              <select name="status" defaultValue={status} className={styles.input}>
                <option value="">Tất cả trạng thái</option>
                {Object.entries(ticketStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button type="submit" className={styles.primary}>Tìm kiếm</button>
          </form>
          {listing.cases.length === 0 ? (
            <p className={styles.empty}>Không có phiếu phù hợp.</p>
          ) : (
            <ul className={styles.caseList}>
              {listing.cases.map((item) => (
                <li key={item.id}>
                  <Link href={href(page, item.id)} className={styles.caseButton} prefetch={false}>
                    <span className={styles.caseMeta}>
                      <span className={styles.caseId}>
                        {ticketLabel(item.id)} · {categoryLabel(item.category)} · {contentDate(item.created_at)}
                      </span>
                      <span className={styles.status} data-status={item.status}>{ticketStatuses[item.status]}</span>
                    </span>
                    <strong>{item.title}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(page > 1 || listing.hasNext) && (
            <nav className={styles.reviewPagination} aria-label="Trang danh sách góp ý">
              {page > 1 && <Link href={href(page - 1)} className={styles.secondary}>Trang trước</Link>}
              <span>Trang {page}</span>
              {listing.hasNext && <Link href={href(page + 1)} className={styles.secondary}>Trang sau</Link>}
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
