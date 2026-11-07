"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ConversationSummary, MessageContact } from "../../lib/messages";
import styles from "./page.module.css";

type IconName = "back" | "compose" | "search" | "close" | "send" | "chat";

const iconPaths = {
  back: <path d="m14 6-6 6 6 6M8 12h12" />,
  compose: <><path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" /><path d="m11 13 1-4 6-6a2.1 2.1 0 1 1 3 3l-6 6-4 1Zm5-8 3 3" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4 4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  send: <path d="M21 3 3.8 10.4a.75.75 0 0 0 .1 1.4l6.2 1.9 1.9 6.2a.75.75 0 0 0 1.4.1L21 3Zm0 0-10.9 10.7" />,
  chat: <path d="M20.5 11.4a8.5 8.5 0 0 1-8.5 8.5H4l1.6-3.4a8.5 8.5 0 1 1 14.9-5.1Z" />,
};

export function MessageIcon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {iconPaths[name]}
    </svg>
  );
}

export function MessageAvatar({ name, online = false }: { name: string; online?: boolean }) {
  const initials = name.trim().split(/\s+/).slice(-2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase("vi-VN");
  const tone = (name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % 5 || 0;
  return <span className={styles.avatar} data-tone={tone} aria-hidden="true">{initials}{online && <i />}</span>;
}

const dateKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short" });
const clock = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "numeric", month: "numeric" });

function matchName(value: string) {
  return value.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d").trim();
}

function colleagueLink(peerId: string) {
  return { pathname: "/tin-nhan", query: { nguoi: peerId } };
}

type InboxProps = {
  accountId: string;
  conversations: ConversationSummary[];
  contacts: MessageContact[];
  activeId: string | null | undefined;
  notice: string;
  refresh: () => void;
};

export function MessageInbox({ accountId, conversations, contacts, activeId, notice, refresh }: InboxProps) {
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const search = matchName(query);
  const unreadThreads = conversations.filter((conversation) => conversation.unread > 0).length;
  const shownConversations = conversations.filter(({ peer, unread }) => (!onlyUnread || unread > 0) && matchName(peer.name).includes(search));
  const existingPeers = new Set(conversations.map(({ peer }) => peer.id));
  const online = new Set(contacts.filter((contact) => contact.online).map((contact) => contact.id));
  const shownContacts = contacts.filter(({ id, displayName }) => matchName(displayName).includes(search) && (compose || !existingPeers.has(id)));
  const showContacts = compose || (Boolean(search) && !onlyUnread);
  const today = dateKey.format(Date.now());

  return (
    <section className={styles.inbox} aria-labelledby="inbox-heading">
      <header className={styles.inboxHeader}>
        <div>
          <p className={styles.inboxKicker}>ALD CONNECT</p>
          <h1 id="inbox-heading">{compose ? "Tin nhắn mới" : "Tin nhắn"}</h1>
        </div>
        <button type="button" className={styles.iconButton} aria-label={compose ? "Đóng danh sách đồng nghiệp" : "Tin nhắn mới"}
          title={compose ? "Đóng" : "Tin nhắn mới"} onClick={() => { setCompose(!compose); setQuery(""); if (!compose) input.current?.focus(); }}>
          <MessageIcon name={compose ? "close" : "compose"} />
        </button>
      </header>

      <p className={styles.privacyNote}>Admin có quyền xem nội dung tin nhắn.</p>

      <div className={styles.search}>
        <MessageIcon name="search" />
        <input ref={input} type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)}
          aria-label="Tìm tên đồng nghiệp" placeholder="Tìm tên đồng nghiệp" maxLength={100} />
      </div>

      {!compose && (
        <div className={styles.filters} role="group" aria-label="Lọc tin nhắn">
          <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>Tất cả</button>
          <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>
            Chưa đọc{unreadThreads > 0 && <span>{unreadThreads}</span>}
          </button>
        </div>
      )}

      {notice && <p className={styles.inboxNotice} role="status">{notice} <button type="button" onClick={refresh}>Thử lại</button></p>}

      {!compose && !search && !onlyUnread && online.size > 0 && (
        <section className={styles.activePeople} aria-labelledby="active-people-heading">
          <h2 id="active-people-heading">Đang online</h2>
          <ul>
            {contacts.filter((contact) => contact.online).slice(0, 8).map((contact) => (
              <li key={contact.id}>
                <Link href={colleagueLink(contact.id)} prefetch={false} aria-label={`Nhắn tin cho ${contact.displayName}`}>
                  <MessageAvatar name={contact.displayName} online />
                  <span>{contact.displayName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.inboxResults}>
        {!compose && shownConversations.length > 0 && (
          <ul className={styles.inboxList} aria-label="Các cuộc trò chuyện">
            {shownConversations.map(({ id, peer, latest, unread }) => (
              <li key={id}>
                <Link href={{ pathname: "/tin-nhan", query: { cuocTroChuyen: id } }} prefetch={false}
                  aria-current={activeId === id ? "page" : undefined} data-unread={unread > 0}>
                  <MessageAvatar name={peer.name} online={online.has(peer.id)} />
                  <span className={styles.preview}>
                    <strong>{peer.name}</strong>
                    <span>{latest.senderId === accountId ? "Bạn: " : ""}{latest.body}</span>
                  </span>
                  <span className={styles.inboxMeta}>
                    <time dateTime={new Date(latest.createdAt).toISOString()}>{(dateKey.format(latest.createdAt) === today ? clock : shortDate).format(latest.createdAt)}</time>
                    {unread > 0 && <span className={styles.badge} aria-label={`${unread} tin chưa đọc`}>{unread > 99 ? "99+" : unread}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {showContacts && shownContacts.length > 0 && (
          <section aria-labelledby="inbox-contacts-heading" className={styles.contacts}>
            <h2 id="inbox-contacts-heading">Đồng nghiệp</h2>
            <ul className={styles.inboxList}>
              {shownContacts.map(({ id, displayName, branch, online: isOnline }) => (
                <li key={id}>
                  <Link href={colleagueLink(id)} prefetch={false}>
                    <MessageAvatar name={displayName} online={isOnline} />
                    <span className={styles.preview}>
                      <strong>{displayName}</strong>
                      <span>{[branch, isOnline ? "Đang online" : "Ngoại tuyến"].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(compose || shownConversations.length === 0) && (!showContacts || shownContacts.length === 0) && (
          <p className={styles.empty}>
            {search ? "Không tìm thấy đồng nghiệp phù hợp." : compose ? "Chưa có đồng nghiệp có thể nhận tin nhắn."
              : onlyUnread ? "Bạn đã đọc hết tin nhắn." : "Chưa có cuộc trò chuyện. Chọn Tin nhắn mới để bắt đầu."}
          </p>
        )}
      </div>
    </section>
  );
}
