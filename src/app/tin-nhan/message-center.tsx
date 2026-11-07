"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import type { ConversationHistory, ConversationSummary, DirectMessage, MessageContact, MessagePeer } from "../../lib/messages";
import { useLiveUpdates } from "../live-updates";
import { MessageAvatar, MessageIcon, MessageInbox } from "./inbox";
import styles from "./page.module.css";

const endpoint = `${process.env.NEXT_PUBLIC_CONNECT_BASE_PATH ?? ""}/api/tin-nhan`;
const INBOX_POLL_MS = 8000;
const THREAD_POLL_MS = 4000;
const CONTACT_REFRESH_MS = 15000;
const INCREMENTAL_PAGE_SIZE = 40; // The history API returns up to 40 messages per request.
const displayTime = new Intl.DateTimeFormat("vi-VN", {
  timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});
const displayDay = new Intl.DateTimeFormat("vi-VN", {
  day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Ho_Chi_Minh",
});

type Props = {
  accountId: string;
  initial: ConversationHistory | null;
  initialInbox: ConversationSummary[];
  initialContacts: MessageContact[];
  initialError: string;
  maxLength: number;
};

type FailedDraft = { requestId: string; body: string };

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(query = "", options?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(endpoint + query, { cache: "no-store", ...options, signal });
  const result = await response.json();
  if (!response.ok) throw new RequestError(response.status, result.error ?? "Chưa thực hiện được. Vui lòng thử lại.");
  return result as T;
}

function post<T>(payload: object) {
  return request<T>("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function mergedMessages(existing: DirectMessage[], incoming: DirectMessage[]) {
  if (!incoming.length) return existing;
  const unique = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => unique.set(message.id, message));
  return [...unique.values()].sort((left, right) => left.id - right.id);
}

function displayError(error: unknown) {
  return error instanceof RequestError ? error.message : "Kết nối bị gián đoạn. Vui lòng thử lại.";
}

function queueRefresh(signal: AbortSignal, update: () => Promise<boolean | void>) {
  let pending = false;
  let inFlight = false;
  const canRefresh = () => !signal.aborted && document.visibilityState !== "hidden";
  return async function refresh() {
    if (!canRefresh()) return;
    pending = true;
    if (inFlight) return;
    inFlight = true;
    try {
      while (pending && canRefresh()) {
        pending = false;
        if (await update()) pending = true;
      }
    } finally {
      inFlight = false;
    }
  };
}

export function MessageCenter({ accountId, initial, initialInbox, initialContacts, initialError, maxLength }: Props) {
  const [chat, setChat] = useState(initial);
  const [inbox, setInbox] = useState(initialInbox);
  const [contacts, setContacts] = useState(initialContacts);
  const [notice, setNotice] = useState(initialError);
  const [inboxNotice, setInboxNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [failedDraft, setFailedDraft] = useState<FailedDraft | null>(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [reading, setReading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);

  const frame = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pinBottom = useRef(true);
  const beforeOlder = useRef<{ height: number; top: number } | null>(null);
  const polledThrough = useRef(initial?.messages.at(-1)?.id ?? 0);
  const readRevision = useRef(0);
  const readInFlight = useRef(false);
  const readLocallyThrough = useRef(0);
  const connectedRef = useRef(false);
  const refreshInbox = useRef<(() => void) | null>(null);
  const refreshThread = useRef<(() => void) | null>(null);
  const currentPeerId = chat?.peer.id;

  const refreshLive = useCallback(() => {
    refreshInbox.current?.();
    refreshThread.current?.();
  }, []);
  const { connected } = useLiveUpdates("messages", refreshLive, { fallbackIntervalMs: 0 });
  useEffect(() => { connectedRef.current = connected; }, [connected]);

  const updateInbox = useCallback((id: string, peer: MessagePeer, latest?: DirectMessage, unread?: number) => {
    setInbox((current) => {
      const previous = current.find((entry) => entry.id === id);
      const last = latest && (!previous || latest.id > previous.latest.id)
        ? { ...latest, body: latest.body.slice(0, 150) } : previous?.latest;
      if (!last) return current;
      return [...current.filter((entry) => entry.id !== id), {
        id, peer, latest: last, unread: unread ?? previous?.unread ?? 0,
      }].sort((left, right) => right.latest.id - left.latest.id);
    });
  }, []);

  const reloadInbox = useCallback(async (signal: AbortSignal) => {
    const revision = readRevision.current;
    try {
      const data = await request<{ conversations: ConversationSummary[]; contacts: MessageContact[] }>("", { signal });
      if (signal.aborted) return;
      setContacts(data.contacts);
      setInbox((previous) => {
        if (revision === readRevision.current) return data.conversations;
        const previousCounts = new Map(previous.map((item) => [item.id, item.unread]));
        return data.conversations.map((item) => ({ ...item, unread: previousCounts.get(item.id) ?? item.unread }));
      });
      setInboxNotice("");
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof RequestError && [401, 403].includes(error.status)) {
        setInbox([]);
        setContacts([]);
        setChat(null);
        setDraft("");
        setFailedDraft(null);
        setNotice(displayError(error));
      } else {
        setInboxNotice(displayError(error));
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let lastRefresh = Date.now();
    const requestInbox = queueRefresh(controller.signal, () => {
      lastRefresh = Date.now();
      return reloadInbox(controller.signal);
    });
    const poll = () => { void requestInbox(); };
    refreshInbox.current = poll;
    const timer = window.setInterval(() => {
      if (!connectedRef.current || Date.now() - lastRefresh >= CONTACT_REFRESH_MS) poll();
    }, INBOX_POLL_MS);
    return () => {
      controller.abort();
      refreshInbox.current = null;
      window.clearInterval(timer);
    };
  }, [reloadInbox]);

  useEffect(() => {
    const peerId = currentPeerId;
    if (!peerId) return;
    const controller = new AbortController();
    let retry = false;

    const requestThread = queueRefresh(controller.signal, async () => {
      const revision = readRevision.current;
      try {
        const params = new URLSearchParams({ nguoi: peerId, sau: String(polledThrough.current) });
        const { history } = await request<{ history: ConversationHistory }>(`?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        retry = false;
        const latest = history.messages.at(-1);
        if (latest) polledThrough.current = latest.id;
        const sameRead = revision === readRevision.current;
        setChat((previous) => previous ? {
          ...previous,
          id: history.id ?? previous.id,
          peer: history.peer,
          unread: sameRead ? history.unread : previous.unread,
          peerReadThrough: Math.max(previous.peerReadThrough, history.peerReadThrough),
          messages: mergedMessages(previous.messages, history.messages),
        } : previous);
        if (history.id) updateInbox(history.id, history.peer, latest, sameRead ? history.unread : undefined);
        setNotice("");
        return history.messages.length === INCREMENTAL_PAGE_SIZE;
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof RequestError && [401, 403, 404].includes(error.status)) {
          controller.abort();
          setChat(null);
          setDraft("");
          setFailedDraft(null);
          setInbox((current) => error.status === 404 ? current.filter((entry) => entry.peer.id !== peerId) : []);
        } else {
          retry = true;
        }
        setNotice(displayError(error));
      }
    });

    const poll = () => { void requestThread(); };
    refreshThread.current = poll;
    const timer = window.setInterval(() => {
      if (!connectedRef.current || retry) poll();
    }, THREAD_POLL_MS);
    return () => {
      controller.abort();
      refreshThread.current = null;
      window.clearInterval(timer);
    };
  }, [currentPeerId, updateInbox]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const wrapper = frame.current;
    if (!currentPeerId || !viewport || !wrapper) return;
    const mobile = window.matchMedia("(max-width: 800px)");
    function fit() {
      if (!viewport || !wrapper || !mobile.matches || Math.abs(viewport.scale - 1) > .01) return;
      wrapper.style.setProperty("--chat-height", `${Math.round(viewport.height)}px`);
      wrapper.style.setProperty("--chat-top", `${Math.round(viewport.offsetTop)}px`);
      if (scroll.current && pinBottom.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      wrapper.style.removeProperty("--chat-height");
      wrapper.style.removeProperty("--chat-top");
    };
  }, [currentPeerId]);

  useLayoutEffect(() => {
    const box = scroll.current;
    if (!box) return;
    const before = beforeOlder.current;
    if (before) {
      box.scrollTop = before.top + box.scrollHeight - before.height;
      beforeOlder.current = null;
    } else if (pinBottom.current) {
      box.scrollTop = box.scrollHeight;
    }
  }, [chat?.messages]);

  async function loadOlder() {
    const first = chat?.messages[0];
    if (!chat?.id || !first || loadingOlder) return;
    setLoadingOlder(true);
    setNotice("");
    try {
      const params = new URLSearchParams({ cuocTroChuyen: chat.id, truoc: String(first.id) });
      const { history } = await request<{ history: ConversationHistory }>(`?${params}`);
      if (scroll.current) beforeOlder.current = { height: scroll.current.scrollHeight, top: scroll.current.scrollTop };
      setChat((previous) => previous ? {
        ...previous, hasOlder: history.hasOlder, messages: mergedMessages(previous.messages, history.messages),
      } : previous);
    } catch (error) {
      setNotice(displayError(error));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!chat?.peer.available || !body || body.length > maxLength || sending) return;
    const attempt = failedDraft?.body === body ? failedDraft : { body, requestId: crypto.randomUUID() };
    setSending(true);
    setSendError("");
    try {
      const { conversationId, message } = await post<{ conversationId: string; message: DirectMessage }>({
        action: "send", recipientId: chat.peer.id, ...attempt,
      });
      pinBottom.current = true;
      setChat((previous) => previous ? {
        ...previous, id: conversationId, messages: mergedMessages(previous.messages, [message]),
      } : previous);
      updateInbox(conversationId, chat.peer, message);
      setDraft("");
      setFailedDraft(null);
    } catch (error) {
      setFailedDraft(attempt);
      setSendError(displayError(error));
    } finally {
      setSending(false);
    }
  }

  const markRead = useCallback(async (id: string, peer: MessagePeer, latest: number, manual = false) => {
    if (readInFlight.current || latest <= readLocallyThrough.current) return;
    readInFlight.current = true;
    setReading(true);
    if (manual) setNotice("");
    try {
      const { unread } = await post<{ unread: number }>({ action: "read", conversationId: id, messageId: latest });
      readRevision.current++;
      readLocallyThrough.current = latest;
      setChat((previous) => previous ? { ...previous, unread } : previous);
      updateInbox(id, peer, undefined, unread);
    } catch (error) {
      if (manual) setNotice(displayError(error));
    } finally {
      readInFlight.current = false;
      setReading(false);
    }
  }, [updateInbox]);

  useEffect(() => {
    const latest = chat?.messages.at(-1);
    if (!chat?.id || !chat.unread || !latest || !nearBottom) return;
    const { id, peer } = chat;
    const markVisible = () => {
      if (document.visibilityState === "visible" && pinBottom.current) void markRead(id, peer, latest.id);
    };
    markVisible();
    document.addEventListener("visibilitychange", markVisible);
    return () => document.removeEventListener("visibilitychange", markVisible);
  }, [chat, markRead, nearBottom]);

  const latest = chat?.messages.at(-1);
  const peerOnline = contacts.some((contact) => contact.id === currentPeerId && contact.online);

  return (
    <div className={styles.layout} ref={frame} data-mobile-chat={chat ? "active" : undefined}>
      <MessageInbox accountId={accountId} conversations={inbox} contacts={contacts} activeId={chat?.id}
        notice={inboxNotice} refresh={() => refreshInbox.current?.()} />

      <section className={styles.chat} aria-labelledby="chat-heading" data-empty={!chat && !notice}>
        {chat ? (
          <>
            <header className={styles.chatHeader}>
              <Link href="/tin-nhan" replace prefetch={false} className={styles.iconButton} aria-label="Quay lại hộp thư" title="Hộp thư">
                <MessageIcon name="back" />
              </Link>
              <MessageAvatar name={chat.peer.name} online={peerOnline} />
              <div className={styles.chatIdentity}>
                <h2 id="chat-heading">{chat.peer.name}</h2>
                <p>{peerOnline ? "Đang online" : "Tin nhắn riêng"}</p>
              </div>
              {chat.unread > 0 && chat.id && latest && (
                <button type="button" className={styles.smallButton} disabled={reading}
                  onClick={() => { if (chat.id) void markRead(chat.id, chat.peer, latest.id, true); }}>
                  {reading ? "Đang cập nhật…" : "Đánh dấu đã đọc"}
                </button>
              )}
            </header>
            <p className={styles.privacyNote}>Admin có quyền xem nội dung tin nhắn.</p>
            {notice && <p className={styles.threadNotice} role="status">{notice}</p>}
            <div className={styles.history} ref={scroll} tabIndex={0} aria-label="Lịch sử cuộc trò chuyện" onScroll={(event) => {
              const box = event.currentTarget;
              pinBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 50;
              setNearBottom(pinBottom.current);
            }}>
              {chat.hasOlder && <button type="button" className={styles.smallButton} disabled={loadingOlder} onClick={loadOlder}>
                {loadingOlder ? "Đang tải…" : "Xem tin cũ hơn"}
              </button>}
              {chat.messages.length ? (
                <ol className={styles.messages} aria-label="Nội dung cuộc trò chuyện" aria-live="polite">
                  {chat.messages.map((message, index) => {
                    const previous = chat.messages[index - 1];
                    const next = chat.messages[index + 1];
                    const mine = message.senderId === accountId;
                    const day = displayDay.format(message.createdAt);
                    const showDay = !previous || displayDay.format(previous.createdAt) !== day;
                    const endOfGroup = !next || next.senderId !== message.senderId || next.createdAt - message.createdAt > 300_000;
                    return (
                      <li key={message.id} className={styles.messageRow} data-mine={mine}>
                        {showDay && <div className={styles.day}>{day}</div>}
                        <div className={styles.message} data-end={endOfGroup}>
                          <span className={styles.srOnly}>{mine ? "Bạn" : chat.peer.name}</span>
                          <p>{message.body}</p>
                          {endOfGroup && <span className={styles.sentTime}>
                            <time dateTime={new Date(message.createdAt).toISOString()}>{displayTime.format(message.createdAt)}</time>
                            {mine && !next && <span> · {chat.peerReadThrough >= message.id ? "Đã xem" : "Đã gửi"}</span>}
                          </span>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className={styles.threadEmpty}>
                  <MessageAvatar name={chat.peer.name} online={peerOnline} />
                  <strong>{chat.peer.name}</strong>
                  <p>Hãy bắt đầu bằng một lời chào.</p>
                </div>
              )}
            </div>
            {chat.peer.available ? (
              <form onSubmit={send} className={styles.composer}>
                <label htmlFor="message-body" className={styles.srOnly}>Tin nhắn của bạn</label>
                <div className={styles.composerRow}>
                  <textarea ref={composer} id="message-body" name="body" rows={1} maxLength={maxLength} value={draft} readOnly={sending}
                    onChange={(event) => { setDraft(event.currentTarget.value); setSendError(""); }}
                    onFocus={() => { pinBottom.current = true; if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }}
                    placeholder="Aa" />
                  <button type="submit" className={styles.sendButton} disabled={sending || !draft.trim()}
                    onPointerDown={(event) => { if (document.activeElement === composer.current) event.preventDefault(); }}
                    aria-label={sending ? "Đang gửi…" : failedDraft?.body === draft.trim() && sendError ? "Thử gửi lại" : "Gửi tin nhắn"}>
                    <MessageIcon name="send" />
                  </button>
                </div>
                {sendError && <p className={styles.error} role="alert">{sendError} {failedDraft?.body === draft.trim() && "Bấm gửi để thử lại."}</p>}
              </form>
            ) : <p className={styles.closed} role="status">Đồng nghiệp này hiện không thể nhận tin nhắn. Bạn vẫn có thể đọc lịch sử cuộc trò chuyện.</p>}
          </>
        ) : (
          <div className={styles.noChat}>
            <span className={styles.emptyIcon}><MessageIcon name="chat" /></span>
            <h2 id="chat-heading">{notice ? "Không mở được cuộc trò chuyện" : "Cuộc trò chuyện của bạn"}</h2>
            <p role={notice ? "alert" : undefined}>{notice || "Chọn một cuộc trò chuyện hoặc tìm đồng nghiệp để gửi tin nhắn."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
