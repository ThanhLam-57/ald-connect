import "server-only";

import type { Account } from "./auth";
import { getDatabase, liveRevisionScopes as scopes } from "./database";

export type LiveTopic = "community" | "announcements" | "feedback" | "messages";

function visibleScopes(account: Account, topic: LiveTopic): [string, string?] {
  switch (topic) {
    case "community":
      return [scopes.shared];
    case "announcements":
      return [scopes.shared, account.role === "LIVE" ? scopes.account + account.id : scopes.announcementReaders];
    case "feedback":
      if (account.role === "ADMIN") return [scopes.admin];
      if (account.role === "HCNS") return [scopes.feedbackQueue, scopes.ticketAssignee + account.id];
      return [scopes.ticketAuthor + account.id];
    case "messages":
      return [account.role === "ADMIN" ? scopes.admin : scopes.account + account.id];
  }
}

export function readLiveRevision(account: Account, topic: LiveTopic): string {
  if (account.disabled) return "0";

  const [scope, additional] = visibleScopes(account, topic);
  const rows = getDatabase().prepare(`
    SELECT scope, CAST(revision AS TEXT) AS revision
    FROM live_revisions
    WHERE topic = ? AND scope IN (?, ?)
  `).all(topic, scope, additional ?? null) as { scope: string; revision: string }[];
  const revisions = new Map(rows.map((row) => [row.scope, row.revision]));
  const primary = revisions.get(scope) ?? "0";
  return additional ? primary + "." + (revisions.get(additional) ?? "0") : primary;
}
