import { createHash, randomBytes } from "node:crypto";

export function newToken() {
  return randomBytes(32).toString("base64url");
}

/** @param {string} token */
export function digestToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} accountId
 * @param {"invite" | "reset"} kind
 */
export function createOneTimeToken(db, accountId, kind) {
  const token = newToken();
  const hours = kind === "invite" ? 24 : 1;
  db.prepare("DELETE FROM auth_tokens WHERE account_id = ? AND kind = ?").run(accountId, kind);
  db.prepare("INSERT INTO auth_tokens (token_hash, account_id, kind, expires_at) VALUES (?, ?, ?, ?)")
    .run(digestToken(token), accountId, kind, Date.now() + hours * 60 * 60 * 1000);
  return token;
}
