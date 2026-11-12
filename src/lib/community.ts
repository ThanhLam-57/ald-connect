import "server-only";

import { randomUUID } from "node:crypto";
import type { Account } from "./auth";
import { managedBranch } from "./branch";
import { getDatabase, transaction } from "./database";

export const POST_LIMIT = 2_000;
export const COMMENT_LIMIT = 1_000;
const PAGE_SIZE = 20;

export type CommunityEntry = {
  id: string;
  isAnonymous: boolean;
  isOwn: boolean;
  authorName: string | null;
  authorRole: Account["role"] | null;
  branchName: string | null;
  /** Chỉ có khi nội dung không ẩn danh; dùng để xác định quản lý cơ sở có quyền kiểm duyệt. */
  authorSource: string | null;
  authorBranchCode: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
  hiddenAt: number | null;
};

export type CommunityPost = CommunityEntry & {
  commentCount: number;
  likeCount: number;
  viewerLiked: number;
};
export type CommunityTarget = { postId: string; commentId?: string };
export type AnonymousCommunityIdentity = {
  displayName: string;
  username: string;
  branchName: string | null;
};

type EntryFlags = { isAnonymous: number; isOwn: number };
type EntryRow<T extends CommunityEntry> = Omit<T, keyof EntryFlags> & EntryFlags;

function authorColumns(entry: "p" | "c") {
  return `
    ${entry}.is_anonymous AS isAnonymous,
    (${entry}.author_id = :viewerId) AS isOwn,
    CASE WHEN ${entry}.is_anonymous = 0 THEN a.display_name END AS authorName,
    CASE WHEN ${entry}.is_anonymous = 0 THEN a.role END AS authorRole,
    CASE WHEN ${entry}.is_anonymous = 0 THEN COALESCE(b.branch_name, a.branch_code) END AS branchName,
    CASE WHEN ${entry}.is_anonymous = 0 THEN a.workforce_source END AS authorSource,
    CASE WHEN ${entry}.is_anonymous = 0 THEN a.branch_code END AS authorBranchCode`;
}

/** Nội dung có tên của nhân viên thuộc cơ sở mà người xem là quản lý. */
function branchAuthored(entry: "p" | "c") {
  return `(:mgrBranch IS NOT NULL AND ${entry}.is_anonymous = 0 AND ${entry}.author_id IN (
    SELECT id FROM accounts WHERE workforce_source = :mgrSource AND branch_code = :mgrBranch))`;
}
function hiddenVisible(entry: "p" | "c") {
  return `(:viewerRole = 'ADMIN' OR ${entry}.hidden_at IS NULL OR ${branchAuthored(entry)})`;
}
function viewerParams(account: Account) {
  const branch = managedBranch(account);
  return {
    viewerRole: account.role,
    viewerId: account.id,
    mgrSource: branch?.source ?? null,
    mgrBranch: branch?.branchCode ?? null,
  };
}

const branchJoin = `
  LEFT JOIN workforce_branches b
    ON b.workforce_source = a.workforce_source AND b.branch_code = a.branch_code`;
const postColumns = `
  p.id, p.body, p.created_at AS createdAt, p.updated_at AS updatedAt,
  p.hidden_at AS hiddenAt, ${authorColumns("p")},
  (SELECT COUNT(*) FROM community_comments c
   WHERE c.post_id = p.id AND c.deleted_at IS NULL
     AND ${hiddenVisible("c")}) AS commentCount,
  (SELECT COUNT(*) FROM community_post_likes l WHERE l.post_id = p.id) AS likeCount,
  EXISTS (SELECT 1 FROM community_post_likes l WHERE l.post_id = p.id AND l.account_id = :viewerId) AS viewerLiked`;
const postVisible = `p.deleted_at IS NULL AND ${hiddenVisible("p")}`;
const publicParent = "EXISTS (SELECT 1 FROM community_posts WHERE id = post_id AND deleted_at IS NULL AND hidden_at IS NULL)";

function active(account: Account) {
  return !account.disabled && (
    account.role !== "LIVE" || Boolean(account.staffCode && account.workforceSource && account.branchCode)
  );
}

export function canWriteCommunity(account: Account) {
  return active(account) && (account.role === "LIVE" || account.role === "HCNS");
}

export function parseCommunityPage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d{1,6}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}

function projectEntry<T extends EntryFlags>(row: T) {
  const { isAnonymous, isOwn, ...entry } = row;
  return { ...entry, isAnonymous: isAnonymous === 1, isOwn: isOwn === 1 };
}

function paginate<T extends EntryFlags>(rows: T[]) {
  return { items: rows.slice(0, PAGE_SIZE).map(projectEntry), hasNext: rows.length > PAGE_SIZE };
}

export function listCommunityPosts(account: Account, page: number) {
  if (!active(account)) return paginate<EntryRow<CommunityPost>>([]);
  const rows = getDatabase().prepare(`
    SELECT ${postColumns}
    FROM community_posts p JOIN accounts a ON a.id = p.author_id
    ${branchJoin}
    WHERE ${postVisible}
    ORDER BY p.created_at DESC, p.id DESC LIMIT :limit OFFSET :offset
  `).all({
    ...viewerParams(account), limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE,
  }) as unknown as EntryRow<CommunityPost>[];
  return paginate(rows);
}

export function getCommunityPost(account: Account, postId: string) {
  if (!active(account)) return null;
  const row = getDatabase().prepare(`
    SELECT ${postColumns}
    FROM community_posts p JOIN accounts a ON a.id = p.author_id
    ${branchJoin}
    WHERE p.id = :postId AND ${postVisible}
  `).get({ ...viewerParams(account), postId }) as unknown as EntryRow<CommunityPost> | undefined;
  return row ? projectEntry(row) : null;
}

export function listCommunityComments(account: Account, postId: string, page: number) {
  if (!active(account)) return paginate<EntryRow<CommunityEntry>>([]);
  const rows = getDatabase().prepare(`
    SELECT c.id, c.body, c.created_at AS createdAt, c.updated_at AS updatedAt,
           c.hidden_at AS hiddenAt, ${authorColumns("c")}
    FROM community_comments c
    JOIN community_posts p ON p.id = c.post_id
    JOIN accounts a ON a.id = c.author_id
    ${branchJoin}
    WHERE p.id = :postId AND ${postVisible}
      AND c.deleted_at IS NULL AND ${hiddenVisible("c")}
    ORDER BY c.created_at DESC, c.id DESC LIMIT :limit OFFSET :offset
  `).all({
    ...viewerParams(account), postId, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE,
  }) as unknown as EntryRow<CommunityEntry>[];
  return paginate(rows);
}

export function getAnonymousCommunityIdentities(account: Account, postId: string, commentIds: string[]) {
  if (!active(account) || account.role !== "ADMIN") return null;

  const rows = getDatabase().prepare(`
    WITH authors AS (
      SELECT p.id, p.author_id, 0 AS isComment
      FROM community_posts p
      WHERE p.id = :postId AND p.is_anonymous = 1 AND p.deleted_at IS NULL
      UNION ALL
      SELECT c.id, c.author_id, 1 AS isComment
      FROM community_comments c JOIN community_posts p ON p.id = c.post_id
      WHERE c.post_id = :postId AND p.deleted_at IS NULL
        AND c.is_anonymous = 1 AND c.deleted_at IS NULL
        AND c.id IN (SELECT value FROM json_each(:commentIds))
    )
    SELECT authors.id, authors.isComment, a.display_name AS displayName, a.username,
           COALESCE(b.branch_name, a.branch_code) AS branchName
    FROM authors JOIN accounts a ON a.id = authors.author_id
    ${branchJoin}
  `).all({ postId, commentIds: JSON.stringify(commentIds) }) as (AnonymousCommunityIdentity & { id: string; isComment: number })[];

  let post: AnonymousCommunityIdentity | undefined;
  const comments = new Map<string, AnonymousCommunityIdentity>();
  for (const { id, isComment, ...identity } of rows) {
    if (isComment) comments.set(id, identity);
    else post = identity;
  }
  return { post, comments };
}

export function createCommunityPost(account: Account, body: string, isAnonymous = false) {
  if (!canWriteCommunity(account) || !body.trim() || body.length > POST_LIMIT) return null;
  const id = randomUUID();
  getDatabase().prepare(`
    INSERT INTO community_posts (id, author_id, body, is_anonymous) VALUES (?, ?, ?, ?)
  `).run(id, account.id, body, Number(isAnonymous));
  return id;
}

export function createCommunityComment(account: Account, postId: string, body: string, isAnonymous = false) {
  if (!canWriteCommunity(account) || !body.trim() || body.length > COMMENT_LIMIT) return false;
  const result = getDatabase().prepare(`
    INSERT INTO community_comments (id, post_id, author_id, body, is_anonymous)
    SELECT ?, id, ?, ?, ? FROM community_posts
    WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL
  `).run(randomUUID(), account.id, body, Number(isAnonymous), postId);
  return result.changes === 1;
}

export function setCommunityPostLike(account: Account, postId: string, liked: boolean) {
  if (!canWriteCommunity(account)) return false;
  const db = getDatabase();
  return transaction(() => {
    const post = db.prepare(`
      SELECT 1 FROM community_posts WHERE id = ? AND deleted_at IS NULL AND hidden_at IS NULL
    `).get(postId);
    if (!post) return false;

    if (liked) {
      db.prepare(`
        INSERT INTO community_post_likes (post_id, account_id) VALUES (?, ?)
        ON CONFLICT (post_id, account_id) DO NOTHING
      `).run(postId, account.id);
    } else {
      db.prepare(`
        DELETE FROM community_post_likes WHERE post_id = ? AND account_id = ?
      `).run(postId, account.id);
    }
    return true;
  });
}
export function changeOwnCommunityEntry(account: Account, target: CommunityTarget, body: string | null, isAnonymous?: boolean) {
  if (!canWriteCommunity(account)) return false;
  const { postId, commentId } = target;
  const maxLength = commentId ? COMMENT_LIMIT : POST_LIMIT;
  if (body !== null && (!body.trim() || body.length > maxLength)) return false;

  const table = commentId ? "community_comments" : "community_posts";
  const matchTarget = commentId ? `id = ? AND post_id = ? AND ${publicParent}` : "id = ?";
  const targetParams = commentId ? [commentId, postId] : [postId];
  const now = Date.now();
  const changes = body === null ? "deleted_at = ?" : "body = ?, updated_at = ?, is_anonymous = COALESCE(?, is_anonymous)";
  const changeParams = body === null ? [now] : [body, now, isAnonymous === undefined ? null : Number(isAnonymous)];
  const result = getDatabase().prepare(`
    UPDATE ${table} SET ${changes}
    WHERE ${matchTarget} AND author_id = ? AND deleted_at IS NULL AND hidden_at IS NULL
  `).run(...changeParams, ...targetParams, account.id);
  return result.changes === 1;
}

export function hideCommunityEntry(account: Account, target: CommunityTarget) {
  return setCommunityEntryHidden(account, target, true);
}

export function unhideCommunityEntry(account: Account, target: CommunityTarget) {
  return setCommunityEntryHidden(account, target, false);
}

function setCommunityEntryHidden(account: Account, target: CommunityTarget, hide: boolean) {
  const branch = managedBranch(account);
  const isAdmin = account.role === "ADMIN";
  if (!active(account) || (!isAdmin && !branch)) return false;
  const db = getDatabase();
  const { postId, commentId } = target;
  const hiddenValue = hide ? Date.now() : null;
  const hiddenState = hide ? "hidden_at IS NULL" : "hidden_at IS NOT NULL";
  // Quản lý cơ sở chỉ kiểm duyệt nội dung có tên của nhân viên cơ sở mình, không bao giờ nội dung ẩn danh và không phải của chính mình.
  const scope = `(? = 1 OR (is_anonymous = 0 AND author_id <> ? AND author_id IN (
    SELECT id FROM accounts WHERE workforce_source = ? AND branch_code = ?)))`;
  const scopeParams = [isAdmin ? 1 : 0, account.id, branch?.source ?? null, branch?.branchCode ?? null] as const;
  return transaction(() => {
    const row = (commentId
      ? db.prepare(`
          UPDATE community_comments SET hidden_at = ?
          WHERE id = ? AND post_id = ? AND deleted_at IS NULL AND ${hiddenState} AND ${scope}
            AND EXISTS (SELECT 1 FROM community_posts WHERE id = post_id AND deleted_at IS NULL)
          RETURNING author_id, is_anonymous
        `).get(hiddenValue, commentId, postId, ...scopeParams)
      : db.prepare(`
          UPDATE community_posts SET hidden_at = ?
          WHERE id = ? AND deleted_at IS NULL AND ${hiddenState} AND ${scope}
          RETURNING author_id, is_anonymous
        `).get(hiddenValue, postId, ...scopeParams)) as { author_id: string; is_anonymous: number } | undefined;
    if (!row) return false;

    db.prepare(`
      INSERT INTO audit_events (actor_account_id, target_account_id, action, details)
      VALUES (?, ?, ?, ?)
    `).run(
      account.id,
      row.author_id,
      (commentId ? "community_comment_" : "community_post_") + (hide ? "hidden" : "unhidden"),
      JSON.stringify({ postId, commentId, anonymous: row.is_anonymous === 1 }),
    );
    return true;
  });
}
