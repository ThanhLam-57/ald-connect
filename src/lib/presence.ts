import { digestToken } from "./auth-token.mjs";
import { getDatabase, transaction } from "./database";

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PRESENCE_TTL = 90_000;
const MIN_HEARTBEAT_SPACING = 10_000;
const names = new Intl.Collator("vi", { sensitivity: "base" });

export type Colleague = {
  id: string;
  displayName: string;
  branch: string | null;
  online: boolean;
  self: boolean;
  canMessage: boolean;
};

type DirectoryResult = { status: 200; colleagues: Colleague[] } | { status: 401 } | { status: 403 };
type PresenceRow = Omit<Colleague, "online" | "self" | "canMessage"> & {
  online: number;
  self: number;
  canMessage: number;
  pending: number;
};

export function recordPresence(token: string | undefined, now = Date.now()): 204 | 401 | 403 {
  if (!token || !SESSION_TOKEN.test(token)) return 401;
  const sessionHash = digestToken(token);
  const db = getDatabase();
  return transaction(() => {
    const account = db.prepare(`
      SELECT a.role, a.staff_code
      FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0 AND a.password_hash IS NOT NULL
    `).get(sessionHash, now);
    if (!account) return 401;
    if (account.role === "LIVE" && account.staff_code === null) return 403;

    const { changes } = db.prepare(`
      INSERT INTO account_presence (session_hash, last_seen_at) VALUES (?, ?)
      ON CONFLICT (session_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at
      WHERE account_presence.last_seen_at <= excluded.last_seen_at - ?
    `).run(sessionHash, now, MIN_HEARTBEAT_SPACING);
    if (changes) {
      db.prepare("DELETE FROM account_presence WHERE last_seen_at <= ?").run(now - PRESENCE_TTL);
    }
    return 204;
  });
}

export function getPresenceDirectory(token: string | undefined, now = Date.now()): DirectoryResult {
  if (!token || !SESSION_TOKEN.test(token)) return { status: 401 };
  const rows = getDatabase().prepare(`
    WITH viewer AS (
      SELECT a.id, a.role, a.workforce_source,
        (a.role = 'LIVE' AND a.staff_code IS NULL) AS pending
      FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0 AND a.password_hash IS NOT NULL
    )
    SELECT
      peer.id, peer.display_name AS displayName,
      COALESCE(branch.branch_name, peer.branch_code, CASE peer.role
        WHEN 'ADMIN' THEN 'Quản trị' WHEN 'HCNS' THEN 'Hành chính nhân sự'
      END) AS branch,
      EXISTS (
        SELECT 1 FROM auth_sessions other_session
        JOIN account_presence presence ON presence.session_hash = other_session.token_hash
        WHERE other_session.account_id = peer.id
          AND other_session.expires_at > ? AND presence.last_seen_at > ?
      ) AS online,
      (peer.id = viewer.id) AS self,
      (viewer.role IN ('HCNS', 'LIVE') AND peer.role IN ('HCNS', 'LIVE') AND peer.id <> viewer.id) AS canMessage,
      viewer.pending
    FROM viewer
    LEFT JOIN accounts peer ON viewer.pending = 0
      AND peer.disabled = 0 AND peer.password_hash IS NOT NULL
      AND (peer.role <> 'LIVE' OR peer.staff_code IS NOT NULL)
      AND (viewer.role = 'ADMIN' OR viewer.workforce_source IS NULL
        OR peer.workforce_source = viewer.workforce_source
        OR (peer.role <> 'LIVE' AND peer.workforce_source IS NULL))
    LEFT JOIN workforce_branches branch ON branch.workforce_source = peer.workforce_source
      AND branch.branch_code = peer.branch_code
  `).all(digestToken(token), now, now, now - PRESENCE_TTL) as (PresenceRow | { id: null; pending: number })[];
  if (!rows.length) return { status: 401 };
  if (rows[0].pending) return { status: 403 };

  const colleagues: Colleague[] = rows.flatMap((row) => row.id === null ? [] : [{
    id: row.id,
    displayName: row.displayName,
    branch: row.branch,
    online: row.online === 1,
    self: row.self === 1,
    canMessage: row.canMessage === 1,
  }]);
  colleagues.sort((left, right) =>
    Number(right.online) - Number(left.online) || names.compare(left.displayName, right.displayName),
  );
  return { status: 200, colleagues };
}
