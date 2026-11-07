import { randomUUID } from "node:crypto";
import type { Account } from "./auth";
import { getDatabase, transaction } from "./database";

export const feedbackCategories = [
  { id: "benefits", label: "Lương, thưởng và phúc lợi" },
  { id: "facility", label: "Cơ sở vật chất" },
  { id: "live", label: "Livestream" },
  { id: "management", label: "Quản lý và cấp trên" },
  { id: "colleague", label: "Đồng nghiệp" },
  { id: "other", label: "Khác" },
] as const;

export const ticketStatuses = {
  NEW: "Đã tiếp nhận",
  OPEN: "Đang xử lý",
  CLOSED: "Hoàn tất",
};

type Ticket = {
  id: string;
  category: string;
  title: string;
  status: keyof typeof ticketStatuses;
  created_at: number;
};

type QueueItem = Pick<Ticket, "id" | "category" | "created_at">;

type Message = {
  id: string;
  author_id: string;
  body: string;
  created_at: number;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  created_at: number;
  acknowledged: number;
  read_count: number;
};

const ticketAccess = "((? = 'LIVE' AND author_id = ?) OR (? = 'HCNS' AND assignee_id = ?))";
const FEEDBACK_REVIEW_PAGE_SIZE = 20;

type FeedbackReviewTicket = Ticket & {
  updated_at: number;
  senderName: string;
  assigneeName: string | null;
};

type FeedbackReviewMessage = Omit<Message, "author_id"> & { authorName: string };

function requireFeedbackAdmin(account: Account) {
  if (account.role !== "ADMIN" || account.disabled) {
    throw new Error("Cần quyền Admin để giám sát góp ý.");
  }
}

export function listFeedbackForReview(
  account: Account,
  filters: { query: string; status: keyof typeof ticketStatuses | ""; page: number },
) {
  requireFeedbackAdmin(account);
  const { query, status, page } = filters;
  const ticketCode = query.replace(/^#/, "") || null;
  const cases = getDatabase().prepare(`
    SELECT id, category, title, status, created_at
    FROM connect_tickets
    WHERE (? = '' OR status = ?)
      AND (? = '' OR instr(lower(title), lower(?)) > 0 OR instr(lower(id), lower(?)) > 0)
    ORDER BY updated_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(status, status, query, query, ticketCode, FEEDBACK_REVIEW_PAGE_SIZE + 1,
    (page - 1) * FEEDBACK_REVIEW_PAGE_SIZE) as unknown as Ticket[];
  return {
    cases: cases.slice(0, FEEDBACK_REVIEW_PAGE_SIZE).map((item) => ({ ...item })),
    hasNext: cases.length > FEEDBACK_REVIEW_PAGE_SIZE,
  };
}

export function getFeedbackForReview(account: Account, id: string) {
  requireFeedbackAdmin(account);
  const db = getDatabase();
  const ticket = db.prepare(`
    SELECT t.id, t.category, t.title, t.status, t.created_at, t.updated_at,
           sender.display_name AS senderName, assignee.display_name AS assigneeName
    FROM connect_tickets t
    JOIN accounts sender ON sender.id = t.author_id
    LEFT JOIN accounts assignee ON assignee.id = t.assignee_id
    WHERE t.id = ?
  `).get(id) as unknown as FeedbackReviewTicket | undefined;
  if (!ticket) return null;
  const messages = db.prepare(`
    SELECT m.id, m.body, m.created_at, author.display_name AS authorName
    FROM connect_ticket_messages m
    JOIN accounts author ON author.id = m.author_id
    WHERE m.ticket_id = ?
    ORDER BY m.created_at, m.rowid
  `).all(id) as unknown as FeedbackReviewMessage[];
  return { ticket: { ...ticket }, messages: messages.map((message) => ({ ...message })) };
}

export function formText(form: FormData, name: string, maxLength: number) {
  const entry = form.get(name);
  if (typeof entry !== "string") return null;
  const value = entry.trim();
  return value.length > 0 && value.length <= maxLength ? value : null;
}

export function isContentId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

const dateTimeFormat = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function contentDate(value: number) {
  return dateTimeFormat.format(value);
}

export function getFeedback(account: Account, selectedId: string | null) {
  const db = getDatabase();
  const access = [account.role, account.id, account.role, account.id] as const;
  const cases = db.prepare(`
    SELECT id, category, title, status, created_at
    FROM connect_tickets WHERE ${ticketAccess}
    ORDER BY updated_at DESC, id DESC
  `).all(...access) as unknown as Ticket[];
  const queue = account.role === "HCNS"
    ? db.prepare(`
        SELECT id, category, created_at
        FROM connect_tickets
        WHERE assignee_id IS NULL AND status = 'NEW'
        ORDER BY created_at, id
      `).all() as unknown as QueueItem[]
    : [];
  const selected = selectedId === null
    ? cases[0]
    : cases.find((item) => item.id === selectedId);
  const sender = account.role === "HCNS" && selected
    ? db.prepare(`
        SELECT a.display_name AS name
        FROM connect_tickets t
        JOIN accounts a ON a.id = t.author_id
        WHERE t.id = ? AND t.assignee_id = ?
      `).get(selected.id, account.id) as { name: string } | undefined
    : undefined;
  const messages = selected
    ? db.prepare(`
        SELECT id, author_id, body, created_at
        FROM connect_ticket_messages
        WHERE ticket_id IN (SELECT id FROM connect_tickets WHERE id = ? AND ${ticketAccess})
        ORDER BY created_at, rowid
      `).all(selected.id, ...access) as unknown as Message[]
    : [];
  return { cases, queue, selected, messages, senderName: sender?.name };
}

export function createFeedback(account: Account, category: string, title: string, body: string) {
  if (account.role !== "LIVE" || !feedbackCategories.some((item) => item.id === category)) return null;
  const db = getDatabase();
  const id = randomUUID();
  transaction(() => {
    db.prepare(`
      INSERT INTO connect_tickets (id, author_id, category, title)
      VALUES (?, ?, ?, ?)
    `).run(id, account.id, category, title);
    db.prepare(`
      INSERT INTO connect_ticket_messages (id, ticket_id, author_id, body)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), id, account.id, body);
  });
  return id;
}

export function claimFeedback(account: Account, id: string) {
  if (account.role !== "HCNS") return false;
  const result = getDatabase().prepare(`
    UPDATE connect_tickets
    SET assignee_id = ?, status = 'OPEN', updated_at = ?
    WHERE id = ? AND status = 'NEW' AND assignee_id IS NULL
  `).run(account.id, Date.now(), id);
  return result.changes === 1;
}

export function replyToFeedback(account: Account, id: string, body: string) {
  const db = getDatabase();
  return transaction(() => {
    const result = db.prepare(`
      UPDATE connect_tickets SET updated_at = ?
      WHERE id = ? AND status IN ('NEW', 'OPEN') AND ${ticketAccess}
    `).run(Date.now(), id, account.role, account.id, account.role, account.id);
    if (result.changes !== 1) return false;

    db.prepare(`
      INSERT INTO connect_ticket_messages (id, ticket_id, author_id, body)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), id, account.id, body);
    return true;
  });
}

export function closeFeedback(account: Account, id: string) {
  if (account.role !== "HCNS") return false;
  const result = getDatabase().prepare(`
    UPDATE connect_tickets SET status = 'CLOSED', updated_at = ?
    WHERE id = ? AND assignee_id = ? AND status = 'OPEN'
  `).run(Date.now(), id, account.id);
  return result.changes === 1;
}

export function listAnnouncements(account: Account) {
  return getDatabase().prepare(`
    SELECT a.id, a.title, a.body, a.created_at,
           CASE WHEN ? = 'LIVE' THEN EXISTS (
             SELECT 1 FROM connect_announcement_reads
             WHERE announcement_id = a.id AND account_id = ?
           ) ELSE 0 END AS acknowledged,
           CASE WHEN ? IN ('HCNS', 'ADMIN') THEN (
             SELECT COUNT(*) FROM connect_announcement_reads WHERE announcement_id = a.id
           ) ELSE 0 END AS read_count
    FROM connect_announcements a
    ORDER BY a.created_at DESC, a.rowid DESC
  `).all(account.role, account.id, account.role) as unknown as Announcement[];
}

export function publishAnnouncement(account: Account, title: string, body: string) {
  if (account.role !== "HCNS") return false;
  getDatabase().prepare(`
    INSERT INTO connect_announcements (id, author_id, title, body)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), account.id, title, body);
  return true;
}

export function acknowledgeAnnouncement(account: Account, id: string) {
  if (account.role !== "LIVE") return false;
  getDatabase().prepare(`
    INSERT OR IGNORE INTO connect_announcement_reads (announcement_id, account_id)
    SELECT id, ? FROM connect_announcements WHERE id = ?
  `).run(account.id, id);
  return true;
}
