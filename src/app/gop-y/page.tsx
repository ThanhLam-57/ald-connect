import Link from "next/link";
import { RefreshOnLiveUpdates } from "../live-updates";
import { requireActiveAccount } from "../../lib/auth";
import {
  contentDate,
  feedbackCategories,
  getFeedback,
  isContentId,
  ticketStatuses,
} from "../../lib/content";
import { completeFeedback, sendFeedbackReply, submitFeedback, takeFeedback } from "./actions";
import { FeedbackReview } from "./feedback-review";
import { categoryLabel, ticketLabel } from "./labels";
import styles from "./page.module.css";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    ticket?: string | string[];
    notice?: string | string[];
    q?: string | string[];
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const account = await requireActiveAccount();
  const params = await searchParams;
  if (account.role === "ADMIN") {
    return (
      <>
        <RefreshOnLiveUpdates topic="feedback" />
        <FeedbackReview account={account} params={params} />
      </>
    );
  }

  const { ticket, notice } = params;
  const isHcns = account.role === "HCNS";
  const { cases, queue, selected, messages, senderName } = getFeedback(
    account,
    ticket === undefined ? null : isContentId(ticket) ? ticket : "",
  );
  const senderLabel = isHcns ? senderName : "Ẩn danh";
  const messageLabels = isHcns ? { own: "Bạn", other: "Người gửi" } : { own: "Ẩn danh", other: "HCNS" };

  return (
    <div className={styles.page}>
      <RefreshOnLiveUpdates topic="feedback" />
      <header className={styles.heading}>
        <p className="page-kicker">KÊNH NỘI BỘ / HÀNH CHÍNH NHÂN SỰ</p>
        <h1 className="page-title">Góp ý HCNS</h1>
        <p className="page-description">
          {isHcns
            ? "Tiếp nhận góp ý và theo dõi những phiếu bạn đang phụ trách."
            : "Gửi đề xuất và trao đổi riêng với HCNS phụ trách phiếu của bạn."}
        </p>
      </header>

      {notice === "sent" && (
        <p className={styles.receipt} role="status">Đã gửi góp ý. Bạn có thể theo dõi phản hồi tại đây.</p>
      )}
      {notice === "invalid" && (
        <p className={styles.notice} role="alert">Kiểm tra lại nội dung và giới hạn ký tự trước khi gửi.</p>
      )}
      {(notice === "unavailable" || (ticket !== undefined && !selected)) && (
        <p className={styles.notice} role="alert">Phiếu đã đổi trạng thái hoặc nằm ngoài phạm vi của tài khoản.</p>
      )}

      <div className={styles.grid}>
        {isHcns ? (
          <section className={styles.card} aria-labelledby="queue-heading">
            <div className={styles.cardHeading}>
              <div>
                <h2 id="queue-heading">Phiếu chờ tiếp nhận</h2>
                <p>Nhận phụ trách phiếu để mở cuộc trao đổi.</p>
              </div>
            </div>
            {queue.length === 0 ? (
              <p className={styles.empty}>Hiện chưa có phiếu chờ.</p>
            ) : (
              <ul className={styles.caseList}>
                {queue.map((item) => (
                  <li key={item.id} className={styles.queueItem}>
                    <div>
                      <span className={styles.caseId}>{ticketLabel(item.id)} · {contentDate(item.created_at)}</span>
                      <strong>{categoryLabel(item.category)}</strong>
                    </div>
                    <form action={takeFeedback}>
                      <input name="ticket" value={item.id} type="hidden" />
                      <button className={styles.secondary} type="submit">Nhận phiếu</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className={styles.card} aria-labelledby="new-feedback-heading">
            <div className={styles.cardHeading}>
              <div>
                <h2 id="new-feedback-heading">Tạo góp ý</h2>
                <p>Phiếu hiển thị là ẩn danh ở phía bạn. HCNS phụ trách và Admin có thể xem tên của bạn cùng nội dung phiếu.</p>
              </div>
            </div>
            <form className={styles.form} action={submitFeedback}>
              <label className={styles.inputLabel}>
                <span className={styles.label}>Chủ đề</span>
                <select className={styles.input} name="category" defaultValue="" required>
                  <option value="" disabled>Chọn một chủ đề</option>
                  {feedbackCategories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label className={styles.inputLabel}>
                <span className={styles.label}>Tiêu đề</span>
                <input className={styles.input} name="title" maxLength={80} required />
              </label>
              <label className={styles.inputLabel}>
                <span className={styles.label}>Nội dung góp ý</span>
                <textarea className={styles.input} name="body" maxLength={2000} rows={5} required />
              </label>
              <div className={styles.actions}>
                <button className={styles.primary} type="submit">Gửi góp ý</button>
              </div>
            </form>
          </section>
        )}

        <section className={styles.card} aria-labelledby="cases-heading">
          <div className={styles.cardHeading}>
            <div>
              <h2 id="cases-heading">{isHcns ? "Phiếu tôi phụ trách" : "Góp ý của tôi"}</h2>
              <p>Mở từng phiếu để xem nội dung và phản hồi.</p>
            </div>
          </div>
          {cases.length === 0 ? (
            <p className={styles.empty}>{isHcns ? "Bạn chưa nhận phụ trách phiếu nào." : "Bạn chưa gửi góp ý nào."}</p>
          ) : (
            <ul className={styles.caseList}>
              {cases.map((item) => (
                <li key={item.id}>
                  <Link
                    className={styles.caseButton}
                    href={"/gop-y?ticket=" + item.id}
                    aria-current={item.id === selected?.id ? "page" : undefined}
                  >
                    <span className={styles.caseMeta}>
                      <span className={styles.caseId}>{ticketLabel(item.id)}</span>
                      <span className={styles.status} data-status={item.status}>{ticketStatuses[item.status]}</span>
                    </span>
                    <strong>{item.title}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <article className={styles.detail} aria-labelledby="detail-title">
              <span className={styles.categoryTag}>{categoryLabel(selected.category)}</span>
              <h3 id="detail-title">{selected.title}</h3>
              <p className={styles.detailMeta}>
                {ticketLabel(selected.id)} · {contentDate(selected.created_at)} · {ticketStatuses[selected.status]}
              </p>
              {senderLabel && (
                <p className={styles.detailMeta}>Người gửi <strong>{senderLabel}</strong></p>
              )}
              <ol className={styles.messages}>
                {messages.map((message) => (
                  <li className={styles.response} key={message.id}>
                    <strong>{message.author_id === account.id ? messageLabels.own : messageLabels.other}</strong>
                    <time className={styles.messageTime} dateTime={new Date(message.created_at).toISOString()}>
                      {contentDate(message.created_at)}
                    </time>
                    <p className={styles.caseMessage}>{message.body}</p>
                  </li>
                ))}
              </ol>

              {selected.status !== "CLOSED" && (
                <form className={styles.form} action={sendFeedbackReply} key={selected.id}>
                  <input type="hidden" name="ticket" value={selected.id} />
                  <label className={styles.inputLabel}>
                    <span className={styles.label}>Nội dung phản hồi</span>
                    <textarea className={styles.input} name="body" rows={3} maxLength={2000} required />
                  </label>
                  <div className={styles.actions}>
                    <button className={styles.primary} type="submit">Gửi phản hồi</button>
                  </div>
                </form>
              )}
              {isHcns && selected.status === "OPEN" && (
                <form className={styles.completeForm} action={completeFeedback}>
                  <input type="hidden" name="ticket" value={selected.id} />
                  <button className={styles.secondary} type="submit">Đánh dấu hoàn tất</button>
                </form>
              )}
            </article>
          )}
        </section>
      </div>
    </div>
  );
}
