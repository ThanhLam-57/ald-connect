import "server-only";

import { randomUUID } from "node:crypto";
import { findSessionAccount, type Account } from "./auth-store";
import { getDatabase, transaction } from "./database";
import { getPresenceDirectory, type Colleague } from "./presence";

export const MAX_MESSAGE_LENGTH = 2_000;
const HISTORY_PAGE_SIZE = 40;
const ADMIN_INBOX_PAGE_SIZE = 30;

type Participant = Pick<Account, "id" | "displayName" | "role" | "staffCode" | "workforceSource" | "branchCode"> & {
  disabled: number;
  hasPassword: number;
};

export type MessagePeer = { id: string; name: string; available: boolean };
export type MessageContact = Pick<Colleague, "id" | "displayName" | "branch" | "online">;
export type DirectMessage = { id: number; senderId: string; body: string; createdAt: number };
export type ConversationSummary = {
  id: string;
  peer: MessagePeer;
  latest: DirectMessage;
  unread: number;
};
export type ConversationHistory = {
  id: string | null;
  peer: MessagePeer;
  messages: DirectMessage[];
  hasOlder: boolean;
  unread: number;
  peerReadThrough: number;
};
export type ConversationSelection = { conversationId: string } | { peerId: string };
type MessageCursor = { before?: number; after?: number };
type Conversation = { id: string; participantA: string; participantB: string };
type AdminConversation = Conversation & { nameA: string; nameB: string; usernameA: string; usernameB: string };
type AdminConversationSummary = AdminConversation & { lastMessageAt: number; lastMessageId: number };

const peerColumns = `p.id, p.display_name AS displayName, p.role, p.disabled,
  p.password_hash IS NOT NULL AS hasPassword, p.staff_code AS staffCode,
  p.workforce_source AS workforceSource, p.branch_code AS branchCode`;
const conversationColumns = `id, participant_a AS participantA, participant_b AS participantB`;
const messageColumns = `id, sender_id AS senderId, body, created_at AS createdAt`;
const adminConversationColumns = `
  c.id, c.participant_a AS participantA, c.participant_b AS participantB,
  a.display_name AS nameA, b.display_name AS nameB,
  a.username AS usernameA, b.username AS usernameB`;
const adminParticipants = `
  FROM dm_conversations c
  JOIN accounts a ON a.id = c.participant_a
  JOIN accounts b ON b.id = c.participant_b`;

export class MessageError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function canUseMessages(account: Pick<Account, "role" | "staffCode" | "workforceSource" | "branchCode">) {
  return account.role === "HCNS" || (
    account.role === "LIVE" && Boolean(account.staffCode && account.workforceSource && account.branchCode)
  );
}

function requireMessageAccount(token: string) {
  const account = findSessionAccount(token);
  if (!account) throw new MessageError(401, "Phiên đăng nhập đã hết hạn.");
  if (!canUseMessages(account)) throw new MessageError(403, "Tài khoản này không có quyền nhắn tin.");
  return account;
}

function findPeer(id: string) {
  return getDatabase().prepare(`SELECT ${peerColumns} FROM accounts p WHERE p.id = ?`).get(id) as Participant | undefined;
}

function canReceiveMessages(peer: Participant) {
  return !peer.disabled && Boolean(peer.hasPassword) && canUseMessages(peer);
}

function peerProfile(peer: Participant): MessagePeer {
  return { id: peer.id, name: peer.displayName, available: canReceiveMessages(peer) };
}

function authorizePeer(actor: Account, peer: Participant | undefined): asserts peer is Participant {
  if (!peer || actor.id === peer.id || (actor.workforceSource && peer.workforceSource && actor.workforceSource !== peer.workforceSource)) {
    throw new MessageError(404, "Không tìm thấy cuộc trò chuyện hoặc đồng nghiệp.");
  }
}

function orderedPair(actorId: string, peerId: string): [string, string] {
  return actorId < peerId ? [actorId, peerId] : [peerId, actorId];
}

function findPair(actorId: string, peerId: string) {
  return getDatabase().prepare(`
    SELECT ${conversationColumns} FROM dm_conversations WHERE participant_a = ? AND participant_b = ?
  `).get(...orderedPair(actorId, peerId)) as Conversation | undefined;
}

function requireParticipant(actor: Account, conversationId: string) {
  const conversation = getDatabase().prepare(`
    SELECT ${conversationColumns} FROM dm_conversations WHERE id = ? AND (participant_a = ? OR participant_b = ?)
  `).get(conversationId, actor.id, actor.id) as Conversation | undefined;
  if (!conversation) throw new MessageError(404, "Không tìm thấy cuộc trò chuyện hoặc đồng nghiệp.");
  const peer = findPeer(conversation.participantA === actor.id ? conversation.participantB : conversation.participantA);
  authorizePeer(actor, peer);
  return { conversation, peer };
}

function countUnread(conversationId: string, accountId: string) {
  const row = getDatabase().prepare(`
    SELECT count(*) AS unread FROM dm_messages
    WHERE conversation_id = ? AND sender_id <> ? AND id > COALESCE((
      SELECT last_message_id FROM dm_reads WHERE conversation_id = ? AND account_id = ?
    ), 0)
  `).get(conversationId, accountId, conversationId, accountId) as { unread: number };
  return row.unread;
}

export function listMessageContacts(token: string | undefined): MessageContact[] {
  const directory = getPresenceDirectory(token);
  if (directory.status !== 200) throw new MessageError(directory.status, "Không thể tải danh bạ tin nhắn.");
  return directory.colleagues.filter((contact) => contact.canMessage).map(({ id, displayName, branch, online }) => (
    { id, displayName, branch, online }
  ));
}

export function listConversations(actor: Account): ConversationSummary[] {
  if (!canUseMessages(actor)) throw new MessageError(403, "Tài khoản này không có quyền nhắn tin.");
  const rows = getDatabase().prepare(`
    SELECT c.id AS conversationId, ${peerColumns},
           last.id AS lastId, last.sender_id AS lastSender, substr(last.body, 1, 150) AS lastBody, last.created_at AS lastAt,
           (SELECT count(*) FROM dm_messages unread
            WHERE unread.conversation_id = c.id AND unread.sender_id <> ?
              AND unread.id > COALESCE(r.last_message_id, 0)) AS unread
    FROM dm_conversations c
    JOIN accounts p ON p.id = CASE WHEN c.participant_a = ? THEN c.participant_b ELSE c.participant_a END
    JOIN dm_messages last ON last.id = (SELECT id FROM dm_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1)
    LEFT JOIN dm_reads r ON r.conversation_id = c.id AND r.account_id = ?
    WHERE (c.participant_a = ? OR c.participant_b = ?)
      AND (? IS NULL OR p.workforce_source IS NULL OR p.workforce_source = ?)
    ORDER BY last.id DESC
  `).all(actor.id, actor.id, actor.id, actor.id, actor.id, actor.workforceSource, actor.workforceSource) as (Participant & {
    conversationId: string; lastId: number; lastSender: string; lastBody: string; lastAt: number; unread: number;
  })[];

  return rows.map((row) => ({
    id: row.conversationId,
    peer: peerProfile(row),
    latest: { id: row.lastId, senderId: row.lastSender, body: row.lastBody, createdAt: row.lastAt },
    unread: row.unread,
  }));
}

function readMessageWindow(conversationId: string, cursor: MessageCursor) {
  const after = cursor.after !== undefined;
  const rows = getDatabase().prepare(`
    SELECT ${messageColumns} FROM dm_messages
    WHERE conversation_id = ? AND id ${after ? ">" : "<"} ?
    ORDER BY id ${after ? "ASC" : "DESC"} LIMIT ?
  `).all(conversationId, cursor.after ?? cursor.before ?? Number.MAX_SAFE_INTEGER, HISTORY_PAGE_SIZE + 1) as DirectMessage[];
  const messages = rows.slice(0, HISTORY_PAGE_SIZE).map((row) => ({ ...row }));
  if (!after) messages.reverse();
  return { messages, hasOlder: !after && rows.length > HISTORY_PAGE_SIZE };
}

function requireAdminMessageReview(actor: Account) {
  if (actor.role !== "ADMIN" || actor.disabled) {
    throw new MessageError(403, "Tài khoản này không có quyền xem toàn bộ tin nhắn.");
  }
}

export function listAdminConversations(actor: Account, before?: number) {
  requireAdminMessageReview(actor);
  const rows = getDatabase().prepare(`
    SELECT ${adminConversationColumns}, last.id AS lastMessageId, last.created_at AS lastMessageAt
    ${adminParticipants}
    JOIN dm_messages last ON last.id = (
      SELECT id FROM dm_messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
    )
    WHERE last.id < ?
    ORDER BY last.id DESC LIMIT ?
  `).all(before ?? Number.MAX_SAFE_INTEGER, ADMIN_INBOX_PAGE_SIZE + 1) as AdminConversationSummary[];
  const conversations = rows.slice(0, ADMIN_INBOX_PAGE_SIZE);
  return {
    conversations,
    nextBefore: rows.length > ADMIN_INBOX_PAGE_SIZE ? conversations.at(-1)?.lastMessageId : undefined,
  };
}

export function readAdminConversation(actor: Account, conversationId: string, before?: number) {
  requireAdminMessageReview(actor);
  const conversation = getDatabase().prepare(`
    SELECT ${adminConversationColumns} ${adminParticipants} WHERE c.id = ?
  `).get(conversationId) as AdminConversation | undefined;
  if (!conversation) return null;
  const { messages, hasOlder } = readMessageWindow(conversation.id, { before });
  return { conversation, messages, nextBefore: hasOlder ? messages[0]?.id : undefined };
}

export function readConversation(actor: Account, selection: ConversationSelection, cursor: MessageCursor = {}): ConversationHistory {
  if (!canUseMessages(actor)) throw new MessageError(403, "Tài khoản này không có quyền nhắn tin.");
  let conversation;
  let peer;
  if ("conversationId" in selection) {
    ({ conversation, peer } = requireParticipant(actor, selection.conversationId));
  } else {
    peer = findPeer(selection.peerId);
    authorizePeer(actor, peer);
    conversation = findPair(actor.id, peer.id);
    if (!conversation && !canReceiveMessages(peer)) {
      throw new MessageError(404, "Không tìm thấy cuộc trò chuyện hoặc đồng nghiệp.");
    }
  }

  if (!conversation) return { id: null, peer: peerProfile(peer), messages: [], hasOlder: false, unread: 0, peerReadThrough: 0 };

  const db = getDatabase();
  const history = readMessageWindow(conversation.id, cursor);
  const peerRead = db.prepare("SELECT last_message_id AS through FROM dm_reads WHERE conversation_id = ? AND account_id = ?")
    .get(conversation.id, peer.id) as { through: number } | undefined;

  return {
    id: conversation.id,
    peer: peerProfile(peer),
    ...history,
    unread: countUnread(conversation.id, actor.id),
    peerReadThrough: peerRead?.through ?? 0,
  };
}

export function sendDirectMessage(token: string, recipientId: string, requestId: string, body: string) {
  return transaction(() => {
    const actor = requireMessageAccount(token);
    const peer = findPeer(recipientId);
    authorizePeer(actor, peer);
    const db = getDatabase();
    let conversation = findPair(actor.id, peer.id);
    const prior = db.prepare(`
      SELECT ${messageColumns}, conversation_id AS conversationId FROM dm_messages WHERE sender_id = ? AND client_request_id = ?
    `).get(actor.id, requestId) as (DirectMessage & { conversationId: string }) | undefined;

    if (prior) {
      if (!conversation || prior.conversationId !== conversation.id || prior.body !== body) {
        throw new MessageError(409, "Mã gửi đã được dùng cho một tin nhắn khác.");
      }
      const { conversationId, ...message } = prior;
      return { conversationId, message };
    }

    if (!canReceiveMessages(peer)) throw new MessageError(409, "Đồng nghiệp này hiện không thể nhận tin nhắn.");
    if (!conversation) {
      const [participantA, participantB] = orderedPair(actor.id, peer.id);
      conversation = { id: randomUUID(), participantA, participantB };
      db.prepare("INSERT INTO dm_conversations (id, participant_a, participant_b) VALUES (?, ?, ?)")
        .run(conversation.id, participantA, participantB);
    }

    const message = db.prepare(`
      INSERT INTO dm_messages (conversation_id, sender_id, client_request_id, body) VALUES (?, ?, ?, ?)
      RETURNING ${messageColumns}
    `).get(conversation.id, actor.id, requestId, body) as DirectMessage;
    return { conversationId: conversation.id, message: { ...message } };
  });
}

export function markConversationRead(token: string, conversationId: string, messageId: number) {
  return transaction(() => {
    const actor = requireMessageAccount(token);
    requireParticipant(actor, conversationId);
    const db = getDatabase();
    if (!db.prepare("SELECT id FROM dm_messages WHERE conversation_id = ? AND id = ?").get(conversationId, messageId)) {
      throw new MessageError(404, "Không tìm thấy tin nhắn trong cuộc trò chuyện này.");
    }
    db.prepare(`
      INSERT INTO dm_reads (conversation_id, account_id, last_message_id) VALUES (?, ?, ?)
      ON CONFLICT(conversation_id, account_id) DO UPDATE
      SET last_message_id = max(dm_reads.last_message_id, excluded.last_message_id)
    `).run(conversationId, actor.id, messageId);
    return { unread: countUnread(conversationId, actor.id) };
  });
}
