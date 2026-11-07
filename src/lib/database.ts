import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | undefined;

const communityTables = ["community_posts", "community_comments"] as const;
const anonymousColumn = "is_anonymous INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymous IN (0, 1))";

function migrateCommunityVisibility(connection: DatabaseSync) {
  const hasVisibility = (table: (typeof communityTables)[number]) =>
    connection.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === "is_anonymous");

  if (communityTables.every(hasVisibility)) return;
  connection.exec("BEGIN IMMEDIATE");
  try {
    for (const table of communityTables) {
      if (!hasVisibility(table)) connection.exec(`ALTER TABLE ${table} ADD COLUMN ${anonymousColumn}`);
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

export function getDatabase(): DatabaseSync {
  if (database) return database;

  const filename = resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.ALD_CONNECT_DB_PATH?.trim() || ".data/connect.sqlite");
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(filename);
  try {
    connection.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('ADMIN', 'HCNS', 'LIVE')),
        password_hash TEXT,
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
        staff_code TEXT,
        workforce_source TEXT,
        branch_code TEXT,
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        CHECK (
          (staff_code IS NULL AND workforce_source IS NULL AND branch_code IS NULL) OR
          (staff_code IS NOT NULL AND workforce_source IS NOT NULL AND branch_code IS NOT NULL)
        )
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS one_enabled_account_per_workforce_record
        ON accounts (workforce_source, staff_code) WHERE disabled = 0 AND staff_code IS NOT NULL;

      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS auth_sessions_by_account ON auth_sessions (account_id);
      CREATE TABLE IF NOT EXISTS auth_tokens (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
        expires_at INTEGER NOT NULL,
        UNIQUE (account_id, kind)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS login_attempts (
        key TEXT PRIMARY KEY,
        failures INTEGER NOT NULL,
        reset_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY,
        actor_account_id TEXT REFERENCES accounts(id),
        target_account_id TEXT NOT NULL REFERENCES accounts(id),
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS connect_tickets (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES accounts(id),
        assignee_id TEXT REFERENCES accounts(id),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'OPEN', 'CLOSED')),
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS tickets_by_author ON connect_tickets (author_id);
      CREATE INDEX IF NOT EXISTS tickets_by_assignee ON connect_tickets (assignee_id);
      CREATE TABLE IF NOT EXISTS connect_ticket_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES connect_tickets(id),
        author_id TEXT NOT NULL REFERENCES accounts(id),
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS messages_by_ticket ON connect_ticket_messages (ticket_id, created_at);

      CREATE TABLE IF NOT EXISTS connect_announcements (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES accounts(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS connect_announcement_reads (
        announcement_id TEXT NOT NULL REFERENCES connect_announcements(id),
        account_id TEXT NOT NULL REFERENCES accounts(id),
        read_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        PRIMARY KEY (announcement_id, account_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS workforce_branches (
        workforce_source TEXT NOT NULL,
        branch_code TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        PRIMARY KEY (workforce_source, branch_code)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS community_posts (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES accounts(id),
        body TEXT NOT NULL,
        ${anonymousColumn},
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        deleted_at INTEGER,
        hidden_at INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS community_posts_by_date ON community_posts (created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS community_posts_by_author ON community_posts (author_id);
      CREATE TABLE IF NOT EXISTS community_post_likes (
        post_id TEXT NOT NULL REFERENCES community_posts(id),
        account_id TEXT NOT NULL REFERENCES accounts(id),
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        PRIMARY KEY (post_id, account_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS community_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES community_posts(id),
        author_id TEXT NOT NULL REFERENCES accounts(id),
        body TEXT NOT NULL,
        ${anonymousColumn},
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        deleted_at INTEGER,
        hidden_at INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS community_comments_by_post ON community_comments (post_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS community_comments_by_author ON community_comments (author_id);

      CREATE TABLE IF NOT EXISTS account_presence (
        session_hash TEXT PRIMARY KEY REFERENCES auth_sessions(token_hash) ON DELETE CASCADE,
        last_seen_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS account_presence_by_time ON account_presence (last_seen_at);

      CREATE TABLE IF NOT EXISTS dm_conversations (
        id TEXT PRIMARY KEY,
        participant_a TEXT NOT NULL REFERENCES accounts(id),
        participant_b TEXT NOT NULL REFERENCES accounts(id),
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        CHECK (participant_a < participant_b),
        UNIQUE (participant_a, participant_b)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS dm_conversations_by_participant_b ON dm_conversations (participant_b);
      CREATE TABLE IF NOT EXISTS dm_messages (
        id INTEGER PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES dm_conversations(id),
        sender_id TEXT NOT NULL REFERENCES accounts(id),
        client_request_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
        UNIQUE (sender_id, client_request_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS dm_messages_by_conversation ON dm_messages (conversation_id, id);
      CREATE TABLE IF NOT EXISTS dm_reads (
        conversation_id TEXT NOT NULL REFERENCES dm_conversations(id),
        account_id TEXT NOT NULL REFERENCES accounts(id),
        last_message_id INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (conversation_id, account_id)
      ) STRICT;
    `);
    migrateCommunityVisibility(connection);
  } catch (error) {
    connection.close();
    throw error;
  }
  database = connection;
  return database;
}

export function transaction<T>(operation: () => T): T {
  const connection = getDatabase();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}
