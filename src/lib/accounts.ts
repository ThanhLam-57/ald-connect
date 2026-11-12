import "server-only";

import { randomUUID } from "node:crypto";
import { getSessionToken, requireActiveAccount } from "./auth";
import { createOneTimeToken, findSessionAccount, normalizeUsername, revokeAccountSessions, type Account, type Role } from "./auth-store";
import { getDatabase, transaction } from "./database";
import { getWorkforceDirectory } from "./workforce";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  HCNS: "Hành chính nhân sự",
  LIVE: "Nhân viên Live",
};

export class AccountManagementError extends Error {}

type ManagedAccount = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: number;
  hasPassword: number;
  staffCode: string | null;
  workforceSource: string | null;
  branchCode: string | null;
  isBranchManager: number;
  updatedAt: number;
};

type AccountChange =
  | { intent: "create"; username: string; displayName: string; role: string }
  | { intent: "role"; accountId: string; role: string }
  | { intent: "link"; accountId: string; source: string; staffCode: string; branchCode: string }
  | { intent: "manager"; accountId: string; enabled: boolean }
  | { intent: "lock" | "unlock" | "invite" | "reset" | "revoke" | "unlink"; accountId: string };

type ChangeResult = {
  message: string;
  credential?: { kind: "invite" | "reset"; token: string };
};

const accountFields = `id, username, display_name AS displayName, role, disabled,
  password_hash IS NOT NULL AS hasPassword, staff_code AS staffCode,
  workforce_source AS workforceSource, branch_code AS branchCode,
  is_branch_manager AS isBranchManager, updated_at AS updatedAt`;

function readAccount(id: string) {
  return getDatabase().prepare(`SELECT ${accountFields} FROM accounts WHERE id = ?`).get(id) as ManagedAccount | undefined;
}

function validRole(role: string): role is Role {
  return Object.hasOwn(roleLabels, role);
}

export function hasWorkforceLink(account: Pick<ManagedAccount, "staffCode" | "workforceSource" | "branchCode">) {
  return Boolean(account.workforceSource && account.staffCode && account.branchCode);
}

export function canManageAccounts(account: Pick<Account, "role">) {
  return account.role === "ADMIN" || account.role === "HCNS";
}

export function listManagedAccounts(actor: Account) {
  if (!canManageAccounts(actor)) return [];
  return getDatabase().prepare(`
    SELECT ${accountFields} FROM accounts
    WHERE ? = 'ADMIN' OR (
      role = 'LIVE' AND staff_code IS NOT NULL AND workforce_source IS NOT NULL AND branch_code IS NOT NULL
    )
    ORDER BY display_name COLLATE NOCASE, username COLLATE NOCASE
  `).all(actor.role) as ManagedAccount[];
}

export function listAccountAudit(actor: Account, accountId: string) {
  requireAdmin(actor);
  return getDatabase().prepare(`
    SELECT e.id, e.action, e.details, e.created_at AS createdAt, a.username AS actor
    FROM audit_events e LEFT JOIN accounts a ON a.id = e.actor_account_id
    WHERE e.target_account_id = ?
      AND (
        e.action NOT IN ('community_post_hidden', 'community_comment_hidden')
        OR COALESCE(json_extract(e.details, '$.anonymous'), 0) = 0
      )
    ORDER BY e.id DESC LIMIT 25
  `).all(accountId) as { id: number; action: string; details: string; createdAt: number; actor: string | null }[];
}

function requireAdmin(actor: Pick<Account, "role">) {
  if (actor.role !== "ADMIN") throw new AccountManagementError("Thao tác này cần quyền Admin.");
}

function record(actorId: string, accountId: string, action: string, details: Record<string, unknown> = {}) {
  getDatabase().prepare(`
    INSERT INTO audit_events (actor_account_id, target_account_id, action, details) VALUES (?, ?, ?, ?)
  `).run(actorId, accountId, action, JSON.stringify(details));
}

function revokeCredentials(accountId: string) {
  revokeAccountSessions(accountId);
  getDatabase().prepare("DELETE FROM auth_tokens WHERE account_id = ?").run(accountId);
}

function protectLastAdmin(target: ManagedAccount) {
  if (target.role !== "ADMIN" || target.disabled || !target.hasPassword) return;
  const other = getDatabase().prepare(`
    SELECT id FROM accounts
    WHERE id <> ? AND role = 'ADMIN' AND disabled = 0 AND password_hash IS NOT NULL
    LIMIT 1
  `).get(target.id);
  if (!other) throw new AccountManagementError("ALD Connect cần giữ ít nhất một tài khoản Admin đang sử dụng được.");
}

function checkLinkAvailable(accountId: string, source: string, staffCode: string) {
  const duplicate = getDatabase().prepare(`
    SELECT id FROM accounts WHERE id <> ? AND disabled = 0 AND workforce_source = ? AND staff_code = ?
  `).get(accountId, source, staffCode);
  if (duplicate) throw new AccountManagementError("Nhân viên này đã được gắn với một tài khoản khác đang mở.");
}

function hasPersonalHistory(accountId: string) {
  return Boolean(getDatabase().prepare(`
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM connect_tickets WHERE author_id = :accountId OR assignee_id = :accountId
    )
      OR EXISTS (SELECT 1 FROM connect_ticket_messages WHERE author_id = :accountId)
      OR EXISTS (SELECT 1 FROM connect_announcement_reads WHERE account_id = :accountId)
      OR EXISTS (SELECT 1 FROM connect_announcements WHERE author_id = :accountId)
      OR EXISTS (SELECT 1 FROM community_posts WHERE author_id = :accountId)
      OR EXISTS (SELECT 1 FROM community_comments WHERE author_id = :accountId)
      OR EXISTS (SELECT 1 FROM community_post_likes WHERE account_id = :accountId)
      OR EXISTS (SELECT 1 FROM dm_conversations WHERE participant_a = :accountId OR participant_b = :accountId)
  `).get({ accountId }));
}

function previousWorkforceLink(target: ManagedAccount) {
  if (hasWorkforceLink(target)) return { source: target.workforceSource, staffCode: target.staffCode };
  return getDatabase().prepare(`
    SELECT json_extract(details, '$.previous.source') AS source,
           json_extract(details, '$.previous.staffCode') AS staffCode
    FROM audit_events WHERE target_account_id = ? AND action = 'workforce_link_removed'
    ORDER BY id DESC LIMIT 1
  `).get(target.id) as { source: string | null; staffCode: string | null } | undefined;
}

function createAccount(actor: Account, input: Extract<AccountChange, { intent: "create" }>): ChangeResult {
  requireAdmin(actor);
  const username = normalizeUsername(input.username);
  const displayName = input.displayName.trim();
  if (!/^[a-z0-9._-]{3,48}$/.test(username)) {
    throw new AccountManagementError("Tên đăng nhập cần 3–48 ký tự gồm chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.");
  }
  if (!displayName || displayName.length > 120) throw new AccountManagementError("Nhập tên hiển thị tối đa 120 ký tự.");
  if (!validRole(input.role)) throw new AccountManagementError("Chọn một trong ba vai trò được hỗ trợ.");

  const db = getDatabase();
  if (db.prepare("SELECT id FROM accounts WHERE username = ?").get(username)) {
    throw new AccountManagementError("Tên đăng nhập này đã được sử dụng.");
  }
  const id = randomUUID();
  db.prepare("INSERT INTO accounts (id, username, display_name, role) VALUES (?, ?, ?, ?)")
    .run(id, username, displayName, input.role);
  record(actor.id, id, "account_created", { role: input.role });
  return { message: `Đã tạo tài khoản ${username}. Mở tài khoản trong danh sách để hoàn tất kích hoạt.` };
}

async function verifyLink(input: Extract<AccountChange, { intent: "link" }>) {
  let directory;
  try {
    directory = await getWorkforceDirectory(true);
  } catch {
    throw new AccountManagementError("Không thể xác minh dữ liệu Workforce lúc này. Vui lòng thử lại.");
  }
  if (!input.source || directory.source !== input.source) {
    throw new AccountManagementError("Nguồn Workforce đã thay đổi. Tìm lại nhân viên trước khi gắn.");
  }
  if (!input.staffCode || !directory.staff.some((staff) => staff.staffCode === input.staffCode)) {
    throw new AccountManagementError("Mã nhân viên đã chọn không có trong nguồn Workforce hiện tại.");
  }
  if (!input.branchCode || !directory.branches.some((branch) => branch.id === input.branchCode)) {
    throw new AccountManagementError("Cơ sở đã chọn không có trong danh sách Workforce hiện tại.");
  }
}

export async function changeManagedAccount(input: AccountChange): Promise<ChangeResult> {
  if (input.intent === "link") {
    requireAdmin(await requireActiveAccount());
    await verifyLink(input);
  }
  await requireActiveAccount();
  const sessionToken = await getSessionToken();

  return transaction(() => {
    const actor = sessionToken ? findSessionAccount(sessionToken) : null;
    if (!actor || !canManageAccounts(actor)) {
      throw new AccountManagementError("Bạn không còn quyền quản lý tài khoản.");
    }
    if (input.intent === "create") return createAccount(actor, input);

    const db = getDatabase();
    const target = readAccount(input.accountId);
    if (!target || (actor.role === "HCNS" && (target.role !== "LIVE" || !hasWorkforceLink(target)))) {
      throw new AccountManagementError("Không tìm thấy tài khoản trong phạm vi quản lý của bạn.");
    }

    switch (input.intent) {
      case "role": {
        requireAdmin(actor);
        if (!validRole(input.role)) throw new AccountManagementError("Chọn một trong ba vai trò được hỗ trợ.");
        if (target.role === input.role) return { message: "Tài khoản đang có vai trò đã chọn." };
        protectLastAdmin(target);
        db.prepare("UPDATE accounts SET role = ?, is_branch_manager = 0, updated_at = ? WHERE id = ?")
          .run(input.role, Date.now(), target.id);
        revokeCredentials(target.id);
        record(actor.id, target.id, "role_changed", { previous: target.role, role: input.role });
        return { message: "Đã cập nhật vai trò và thu hồi các phiên của tài khoản." };
      }
      case "link": {
        requireAdmin(actor);
        if (target.staffCode === input.staffCode && target.workforceSource === input.source && target.branchCode === input.branchCode) {
          return { message: "Tài khoản đã gắn với nhân viên và cơ sở đã chọn." };
        }
        const previous = previousWorkforceLink(target);
        const reassigning = previous && (previous.source !== input.source || previous.staffCode !== input.staffCode);
        if (reassigning) {
          if (hasPersonalHistory(target.id)) {
            throw new AccountManagementError("Tài khoản đã có lịch sử cá nhân. Hãy tạo tài khoản riêng cho nhân viên khác.");
          }
          protectLastAdmin(target);
        }
        checkLinkAvailable(target.id, input.source, input.staffCode);
        const managerCleared = Boolean(target.isBranchManager) &&
          (Boolean(reassigning) || target.branchCode !== input.branchCode);
        db.prepare(`
          UPDATE accounts
          SET workforce_source = ?, staff_code = ?, branch_code = ?,
              password_hash = CASE WHEN ? THEN NULL ELSE password_hash END,
              is_branch_manager = CASE WHEN ? THEN 0 ELSE is_branch_manager END, updated_at = ?
          WHERE id = ?
        `).run(input.source, input.staffCode, input.branchCode, reassigning ? 1 : 0, managerCleared ? 1 : 0, Date.now(), target.id);
        revokeCredentials(target.id);
        record(actor.id, target.id, "workforce_link_changed", {
          previous: { source: target.workforceSource, staffCode: target.staffCode, branchCode: target.branchCode },
          current: { source: input.source, staffCode: input.staffCode, branchCode: input.branchCode },
          passwordCleared: Boolean(reassigning),
          managerCleared,
        });
        return { message: reassigning
          ? "Đã đổi nhân viên liên kết. Cấp đường dẫn kích hoạt mới để nhân viên đặt mật khẩu."
          : "Đã lưu liên kết Workforce và thu hồi các phiên của tài khoản." };
      }
      case "manager": {
        requireAdmin(actor);
        if (target.role !== "LIVE" || !hasWorkforceLink(target)) {
          throw new AccountManagementError("Chỉ tài khoản Nhân viên Live đã gắn Workforce mới làm được quản lý cơ sở.");
        }
        if (input.enabled && target.disabled) {
          throw new AccountManagementError("Mở khóa tài khoản trước khi cấp quyền quản lý cơ sở.");
        }
        if (Boolean(target.isBranchManager) === input.enabled) {
          return { message: input.enabled ? "Tài khoản đã là quản lý cơ sở." : "Tài khoản không phải quản lý cơ sở." };
        }
        db.prepare("UPDATE accounts SET is_branch_manager = ?, updated_at = ? WHERE id = ?")
          .run(input.enabled ? 1 : 0, Date.now(), target.id);
        record(actor.id, target.id, input.enabled ? "branch_manager_granted" : "branch_manager_revoked", {
          source: target.workforceSource, branchCode: target.branchCode,
        });
        return { message: input.enabled ? "Đã cấp quyền quản lý cơ sở." : "Đã thu hồi quyền quản lý cơ sở." };
      }
      case "unlink": {
        requireAdmin(actor);
        if (!hasWorkforceLink(target)) return { message: "Tài khoản chưa có liên kết Workforce." };
        if (hasPersonalHistory(target.id)) {
          throw new AccountManagementError("Tài khoản đã có lịch sử cá nhân. Có thể khóa tài khoản để dừng truy cập.");
        }
        protectLastAdmin(target);
        db.prepare(`
          UPDATE accounts SET workforce_source = NULL, staff_code = NULL, branch_code = NULL,
                              password_hash = NULL, is_branch_manager = 0, updated_at = ? WHERE id = ?
        `).run(Date.now(), target.id);
        revokeCredentials(target.id);
        record(actor.id, target.id, "workforce_link_removed", {
          previous: { source: target.workforceSource, staffCode: target.staffCode, branchCode: target.branchCode },
        });
        return { message: "Đã bỏ liên kết Workforce, xóa mật khẩu và thu hồi phiên đăng nhập." };
      }
      case "revoke": {
        requireAdmin(actor);
        revokeCredentials(target.id);
        db.prepare("UPDATE accounts SET updated_at = ? WHERE id = ?").run(Date.now(), target.id);
        record(actor.id, target.id, "credentials_revoked");
        return { message: "Đã thu hồi phiên đăng nhập và các đường dẫn đã cấp." };
      }
      case "lock":
      case "unlock": {
        const disabled = input.intent === "lock" ? 1 : 0;
        if (target.disabled === disabled) return { message: disabled ? "Tài khoản đã bị khóa." : "Tài khoản đang mở." };
        if (disabled) protectLastAdmin(target);
        if (!disabled && target.workforceSource && target.staffCode) {
          checkLinkAvailable(target.id, target.workforceSource, target.staffCode);
        }
        db.prepare("UPDATE accounts SET disabled = ?, updated_at = ? WHERE id = ?")
          .run(disabled, Date.now(), target.id);
        revokeCredentials(target.id);
        record(actor.id, target.id, disabled ? "account_locked" : "account_unlocked");
        return { message: disabled ? "Đã khóa tài khoản và thu hồi các phiên." : "Đã mở khóa tài khoản." };
      }
      case "invite":
      case "reset": {
        if (input.intent === "reset") requireAdmin(actor);
        if (target.disabled) throw new AccountManagementError("Mở khóa tài khoản trước khi cấp đường dẫn.");
        if (Boolean(target.hasPassword) !== (input.intent === "reset")) {
          throw new AccountManagementError("Trạng thái kích hoạt đã thay đổi. Tải lại trang và chọn thao tác phù hợp.");
        }
        const token = createOneTimeToken(db, target.id, input.intent);
        record(actor.id, target.id, input.intent === "invite" ? "activation_issued" : "reset_issued");
        return {
          message: input.intent === "invite" ? "Đã cấp đường dẫn kích hoạt." : "Đã cấp đường dẫn đặt lại mật khẩu.",
          credential: { kind: input.intent, token },
        };
      }
    }
  });
}
