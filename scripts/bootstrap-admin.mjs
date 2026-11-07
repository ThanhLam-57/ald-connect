import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createOneTimeToken } from "../src/lib/auth-token.mjs";

for (const envFile of [".env.local", ".env"]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

async function main() {
  const args = process.argv.slice(process.argv[2] === "--" ? 3 : 2);
  const [name = "admin", display = "Quản trị ALD"] = args;
  const username = name.trim().toLowerCase();
  const displayName = display.trim();
  if (args.length > 2 || !/^[a-z0-9._-]{3,48}$/.test(username) || !displayName || displayName.length > 100) {
    throw new Error("Dùng lệnh pnpm bootstrap:admin [tên-đăng-nhập] [tên-hiển-thị].");
  }

  const basePath = process.env.NEXT_PUBLIC_CONNECT_BASE_PATH || "";
  const publicUrl = URL.parse(process.env.CONNECT_PUBLIC_URL || `http://127.0.0.1:3017${basePath}`);
  const loopback = publicUrl && ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
  if (!publicUrl || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash ||
    (publicUrl.protocol !== "https:" && !(publicUrl.protocol === "http:" && loopback))) {
    throw new Error("CONNECT_PUBLIC_URL phải là URL HTTPS hoặc HTTP trên máy cục bộ.");
  }

  const { getDatabase, transaction } = await import("../src/lib/database.ts");
  const db = getDatabase();
  const token = transaction(() => {
    const admins = db.prepare(
      "SELECT id, username, password_hash, disabled FROM accounts WHERE role = 'ADMIN'",
    ).all();
    const existing = admins[0];
    if (existing && (admins.length !== 1 || existing.username !== username ||
      existing.password_hash !== null || existing.disabled !== 0)) {
      throw new Error("Đã có tài khoản Admin. Dùng trang quản trị để cấp hoặc đặt lại tài khoản.");
    }

    const id = existing?.id ?? randomUUID();
    const now = Date.now();
    if (!existing) {
      db.prepare(`
        INSERT INTO accounts (id, username, display_name, role, created_at, updated_at)
        VALUES (?, ?, ?, 'ADMIN', ?, ?)
      `).run(id, username, displayName, now, now);
    }

    db.prepare(`
      INSERT INTO audit_events (actor_account_id, target_account_id, action, details, created_at)
      VALUES (NULL, ?, ?, ?, ?)
    `).run(id, existing ? "reissue_admin_invite" : "bootstrap_admin", JSON.stringify({ username }), now);
    return createOneTimeToken(db, id, "invite");
  });

  publicUrl.pathname = publicUrl.pathname.replace(/\/+$/, "") + "/kich-hoat";
  publicUrl.searchParams.set("ma", token);
  process.stdout.write(`Tên đăng nhập là ${username}. Liên kết kích hoạt có hiệu lực 24 giờ.\n${publicUrl.href}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Không thể cấp tài khoản Admin."}\n`);
  process.exitCode = 1;
}
