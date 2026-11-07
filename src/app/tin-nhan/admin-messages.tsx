import Link from "next/link";
import { notFound } from "next/navigation";
import { recordAdminReview } from "../../lib/admin-review";
import type { Account } from "../../lib/auth";
import { contentDate, isContentId } from "../../lib/content";
import { listAdminConversations, readAdminConversation } from "../../lib/messages";
import { RefreshOnLiveUpdates } from "../live-updates";
import styles from "./page.module.css";

type Params = Record<string, string | string[] | undefined>;

function parseCursor(value: Params[string]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) notFound();
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) notFound();
  return cursor;
}

function ConversationHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header>
      <p className="page-kicker">ALD CONNECT · QUẢN TRỊ</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-description">{children}</p>
    </header>
  );
}

export function AdminMessages({ account, params }: { account: Account; params: Params }) {
  const { cuocTroChuyen, truoc, danhSachTruoc } = params;
  if (cuocTroChuyen !== undefined) {
    if (!isContentId(cuocTroChuyen)) notFound();
    const before = parseCursor(truoc);
    const history = readAdminConversation(account, cuocTroChuyen, before);
    if (!history) notFound();
    const { conversation, messages, nextBefore } = history;
    recordAdminReview(account, "chat", conversation.id);
    return (
      <section className={styles.adminPage}>
        <RefreshOnLiveUpdates topic="messages" />
        <ConversationHeader title="Nội dung cuộc trò chuyện">Chế độ chỉ xem dành cho Admin.</ConversationHeader>
        <div className={styles.adminCard}>
          <h2>{conversation.nameA} và {conversation.nameB}</h2>
          <p className={styles.adminMeta}>@{conversation.usernameA} · @{conversation.usernameB}</p>
          <div className={styles.adminNav}>
            <Link className={styles.smallButton} href="/tin-nhan" prefetch={false}>Về danh sách</Link>
            {before !== undefined && (
              <Link className={styles.smallButton} href={{ pathname: "/tin-nhan", query: { cuocTroChuyen } }} prefetch={false}>Tin mới nhất</Link>
            )}
            {nextBefore !== undefined && (
              <Link className={styles.smallButton} href={{ pathname: "/tin-nhan", query: { cuocTroChuyen, truoc: nextBefore } }} prefetch={false}>Tin cũ hơn</Link>
            )}
          </div>
          {messages.length > 0 ? (
            <ol className={styles.adminMessages} aria-label="Nội dung cuộc trò chuyện">
              {messages.map((message) => (
                <li key={message.id} data-participant-b={message.senderId === conversation.participantB}>
                  <strong>{message.senderId === conversation.participantB ? conversation.nameB : conversation.nameA}</strong>
                  <p>{message.body}</p>
                  <time dateTime={new Date(message.createdAt).toISOString()}>{contentDate(message.createdAt)}</time>
                </li>
              ))}
            </ol>
          ) : <p className={styles.empty}>Trang này chưa có tin nhắn.</p>}
        </div>
      </section>
    );
  }

  const before = parseCursor(danhSachTruoc);
  const { conversations, nextBefore } = listAdminConversations(account, before);
  return (
    <section className={styles.adminPage}>
      <RefreshOnLiveUpdates topic="messages" />
      <ConversationHeader title="Tất cả cuộc trò chuyện">Chế độ chỉ xem dành cho Admin. Chọn một cuộc trò chuyện để đọc nội dung.</ConversationHeader>
      <div className={styles.adminCard}>
        {conversations.length > 0 ? (
          <ul className={styles.adminList} aria-label="Các cuộc trò chuyện">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link href={{ pathname: "/tin-nhan", query: { cuocTroChuyen: conversation.id } }} prefetch={false}>
                  <strong>{conversation.nameA} và {conversation.nameB}</strong>
                  <span>@{conversation.usernameA} · @{conversation.usernameB}</span>
                  <time dateTime={new Date(conversation.lastMessageAt).toISOString()}>{contentDate(conversation.lastMessageAt)}</time>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className={styles.empty}>Trang này chưa có cuộc trò chuyện.</p>}
        {(before !== undefined || nextBefore !== undefined) && (
          <div className={styles.adminNav}>
            {before !== undefined && <Link className={styles.smallButton} href="/tin-nhan" prefetch={false}>Cuộc trò chuyện mới nhất</Link>}
            {nextBefore !== undefined && (
              <Link className={styles.smallButton} href={{ pathname: "/tin-nhan", query: { danhSachTruoc: nextBefore } }} prefetch={false}>Cuộc trò chuyện cũ hơn</Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
