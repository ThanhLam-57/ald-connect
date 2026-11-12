import "server-only";

import type { Account } from "./auth";
import { getDatabase } from "./database";

export type ManagedBranch = { source: string; branchCode: string };

/** Cơ sở mà tài khoản được quản lý, hoặc null nếu không phải quản lý cơ sở đang hoạt động. */
export function managedBranch(account: Account): ManagedBranch | null {
  if (account.role !== "LIVE" || !account.isBranchManager || account.disabled) return null;
  if (!account.workforceSource || !account.branchCode || !account.staffCode) return null;
  return { source: account.workforceSource, branchCode: account.branchCode };
}

export type BranchAccount = {
  staffCode: string;
  displayName: string;
  disabled: number;
  hasPassword: number;
  isBranchManager: number;
};

export function listBranchAccounts(account: Account): BranchAccount[] {
  const branch = managedBranch(account);
  if (!branch) return [];
  return getDatabase().prepare(`
    SELECT staff_code AS staffCode, display_name AS displayName, disabled,
           password_hash IS NOT NULL AS hasPassword, is_branch_manager AS isBranchManager
    FROM accounts
    WHERE role = 'LIVE' AND workforce_source = ? AND branch_code = ? AND staff_code IS NOT NULL
      AND (disabled = 0 OR password_hash IS NOT NULL)
    ORDER BY display_name COLLATE NOCASE
  `).all(branch.source, branch.branchCode) as BranchAccount[];
}

export type BranchAnnouncementReads = {
  id: string;
  title: string;
  createdAt: number;
  confirmed: number;
  total: number;
};

/** Số nhân viên đang hoạt động của cơ sở đã xác nhận đọc từng thông báo gần đây. */
export function listBranchAnnouncementReads(account: Account, limit = 10): BranchAnnouncementReads[] {
  const branch = managedBranch(account);
  if (!branch) return [];
  return getDatabase().prepare(`
    WITH members AS (
      SELECT id FROM accounts
      WHERE role = 'LIVE' AND workforce_source = :source AND branch_code = :branch
        AND staff_code IS NOT NULL AND disabled = 0 AND password_hash IS NOT NULL
    )
    SELECT n.id, n.title, n.created_at AS createdAt,
           (SELECT COUNT(*) FROM connect_announcement_reads r
            WHERE r.announcement_id = n.id AND r.account_id IN (SELECT id FROM members)) AS confirmed,
           (SELECT COUNT(*) FROM members) AS total
    FROM connect_announcements n
    ORDER BY n.created_at DESC, n.rowid DESC
    LIMIT :limit
  `).all({ source: branch.source, branch: branch.branchCode, limit }) as BranchAnnouncementReads[];
}
