import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createOneTimeToken, digestToken, newToken } from "./auth-token.mjs";
import { getDatabase, transaction } from "./database";

export { createOneTimeToken } from "./auth-token.mjs";

export type Role = "ADMIN" | "HCNS" | "LIVE";
export type Account = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  staffCode: string | null;
  workforceSource: string | null;
  branchCode: string | null;
  isBranchManager: boolean;
};
export type AccountTokenKind = "invite" | "reset";

type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  disabled: number;
  staff_code: string | null;
  workforce_source: string | null;
  branch_code: string | null;
  is_branch_manager: number;
  password_hash: string | null;
};

const ACCOUNT_COLUMNS = "a.id, a.username, a.display_name, a.role, a.disabled, a.staff_code, a.workforce_source, a.branch_code, a.is_branch_manager";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,48}$/;
const GLOBAL_LOGIN_BUCKET = "global:login";
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const DUMMY_PASSWORD_HASH = "scrypt$" + "0".repeat(32) + "$" + "0".repeat(64);
export const SESSION_TTL = 12 * 60 * 60 * 1000;

function toAccount(row: AccountRow | undefined): Account | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    disabled: row.disabled === 1,
    staffCode: row.staff_code,
    workforceSource: row.workforce_source,
    branchCode: row.branch_code,
    isBranchManager: row.is_branch_manager === 1,
  };
}

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function validatePassword(input: string): string | null {
  return input.length < 12 || input.length > 128 || !input.trim()
    ? "Mật khẩu phải có từ 12 đến 128 ký tự."
    : null;
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePassword(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [, salt, digest] = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(stored) ?? [];
  if (!salt || !digest) return false;
  const key = await derivePassword(password, Buffer.from(salt, "hex"));
  return timingSafeEqual(key, Buffer.from(digest, "hex"));
}

export function getAccountById(accountId: string): Account | null {
  const row = getDatabase().prepare(
    `SELECT ${ACCOUNT_COLUMNS} FROM accounts a WHERE a.id = ?`,
  ).get(accountId) as AccountRow | undefined;
  return toAccount(row);
}

export function findSessionAccount(rawToken: string): Account | null {
  if (!TOKEN_PATTERN.test(rawToken)) return null;
  const row = getDatabase().prepare(`
    SELECT ${ACCOUNT_COLUMNS} FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND a.disabled = 0 AND a.password_hash IS NOT NULL
  `).get(digestToken(rawToken), Date.now()) as AccountRow | undefined;
  return toAccount(row);
}

export function revokeSession(rawToken: string): void {
  if (TOKEN_PATTERN.test(rawToken)) {
    getDatabase().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(digestToken(rawToken));
  }
}

export function revokeAccountSessions(accountId: string): void {
  getDatabase().prepare("DELETE FROM auth_sessions WHERE account_id = ?").run(accountId);
}

function reserveLoginAttempt(username: string, now: number): boolean {
  const db = getDatabase();
  return transaction(() => {
    db.prepare("DELETE FROM login_attempts WHERE reset_at <= ?").run(now);
    const limits = db.prepare("SELECT key, failures FROM login_attempts WHERE key IN (?, ?)")
      .all(username, GLOBAL_LOGIN_BUCKET) as { key: string; failures: number }[];
    if (limits.some(({ key, failures }) => failures >= (key === GLOBAL_LOGIN_BUCKET ? 60 : 8))) {
      return false;
    }

    const increment = db.prepare(`
      INSERT INTO login_attempts (key, failures, reset_at) VALUES (?, 1, ?)
      ON CONFLICT (key) DO UPDATE SET failures = failures + 1
    `);
    increment.run(GLOBAL_LOGIN_BUCKET, now + 60 * 1000);
    increment.run(username, now + 15 * 60 * 1000);
    return true;
  });
}

export async function authenticate(usernameInput: string, password: string): Promise<string | null> {
  const username = normalizeUsername(usernameInput);
  if (!USERNAME_PATTERN.test(username) || password.length > 128 || !password) return null;

  const now = Date.now();
  if (!reserveLoginAttempt(username, now)) return null;

  const db = getDatabase();
  const row = db.prepare(`
    SELECT id, password_hash, disabled FROM accounts WHERE username = ?
  `).get(username) as Pick<AccountRow, "id" | "password_hash" | "disabled"> | undefined;
  const valid = await verifyPassword(password, row?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!valid || !row || !row.password_hash || row.disabled) return null;

  const token = newToken();
  return transaction(() => {
    const createdAt = Date.now();
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(createdAt);
    const { changes } = db.prepare(`
      INSERT INTO auth_sessions (token_hash, account_id, expires_at)
      SELECT ?, id, ? FROM accounts WHERE id = ? AND password_hash = ? AND disabled = 0
    `).run(digestToken(token), createdAt + SESSION_TTL, row.id, row.password_hash);
    if (!changes) return null;
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(username);
    return token;
  });
}

export function issueAccountToken(accountId: string, kind: AccountTokenKind): string {
  return transaction(() => createOneTimeToken(getDatabase(), accountId, kind));
}

function accountForToken(db: DatabaseSync, rawToken: string, kind: AccountTokenKind) {
  if (!TOKEN_PATTERN.test(rawToken)) return undefined;
  return db.prepare(`
    SELECT a.id, a.username FROM auth_tokens t JOIN accounts a ON a.id = t.account_id
    WHERE t.token_hash = ? AND t.kind = ? AND t.expires_at > ? AND a.disabled = 0
      AND ((t.kind = 'invite' AND a.password_hash IS NULL) OR
        (t.kind = 'reset' AND a.password_hash IS NOT NULL))
  `).get(digestToken(rawToken), kind, Date.now()) as { id: string; username: string } | undefined;
}

export function isAccountTokenValid(rawToken: string, kind: AccountTokenKind): boolean {
  return Boolean(accountForToken(getDatabase(), rawToken, kind));
}

export async function consumeAccountToken(rawToken: string, kind: AccountTokenKind, password: string) {
  const db = getDatabase();
  if (!accountForToken(db, rawToken, kind) || validatePassword(password)) return false;
  const passwordHash = await hashPassword(password);
  return transaction(() => {
    const account = accountForToken(db, rawToken, kind);
    if (!account) return false;
    db.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, Date.now(), account.id);
    db.prepare("DELETE FROM auth_tokens WHERE account_id = ?").run(account.id);
    db.prepare("DELETE FROM login_attempts WHERE key = ?").run(account.username);
    revokeAccountSessions(account.id);
    return true;
  });
}
