import "server-only";
import type { Account } from "./auth";
import { getDatabase } from "./database";

type ReviewKind = "chat" | "feedback" | "community";

export function recordAdminReview(account: Account, kind: ReviewKind, contentId: string) {
  if (account.role !== "ADMIN" || account.disabled) return;
  const action = "admin_review_" + kind;
  const details = JSON.stringify({ contentId });

  getDatabase().prepare(`
    INSERT INTO audit_events (actor_account_id, target_account_id, action, details)
    SELECT :actor, :actor, :action, :details
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_events
      WHERE target_account_id = :actor AND action = :action
        AND created_at >= :recent AND details = :details
    )
  `).run({ actor: account.id, action, details, recent: Date.now() - 60_000 });
}
