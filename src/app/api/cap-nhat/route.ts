import { createHash } from "node:crypto";
import { getSessionToken } from "../../../lib/auth";
import { findSessionAccount, type Account } from "../../../lib/auth-store";
import { readLiveRevision, type LiveTopic } from "../../../lib/live-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_INTERVAL_MS = 750;
const PULSE_INTERVAL_MS = 10_000;
const STREAM_DURATION_MS = 55_000;
const privateHeaders = { "Cache-Control": "private, no-store, no-transform", Vary: "Cookie" };
const encoder = new TextEncoder();

function isTopic(topic: string | null): topic is LiveTopic {
  return topic === "community" || topic === "announcements" || topic === "feedback" || topic === "messages";
}

function canSubscribe(account: Account): boolean {
  return account.role !== "LIVE" || Boolean(account.staffCode && account.workforceSource && account.branchCode);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const topic = params.get("topic");
  if (!isTopic(topic) || params.getAll("topic").length !== 1) {
    return new Response(null, { status: 400, headers: privateHeaders });
  }

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new Response(null, { status: 403, headers: privateHeaders });
  }

  const token = await getSessionToken();
  const account = token ? findSessionAccount(token) : null;
  if (!account || !token) return new Response(null, { status: 401, headers: privateHeaders });
  if (!canSubscribe(account)) return new Response(null, { status: 403, headers: privateHeaders });

  let revision = readLiveRevision(account, topic);
  const lastEventId = request.headers.get("last-event-id");
  let cancel = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const expiresAt = Date.now() + STREAM_DURATION_MS;
      let lastPulse = Date.now();
      let timer: ReturnType<typeof setInterval> | undefined;
      let closed = false;

      function cleanup() {
        closed = true;
        clearInterval(timer);
        request.signal.removeEventListener("abort", close);
      }

      function close() {
        if (closed) return;
        cleanup();
        controller.close();
      }

      function send(event: "update" | "pulse" | "session-ended", id?: string) {
        const cursor = id ? `id: ${id}\n` : "";
        controller.enqueue(encoder.encode(`${cursor}event: ${event}\ndata: {}\n\n`));
      }

      const eventId = () => createHash("sha256").update(JSON.stringify([account.id, account.role, topic, revision])).digest("base64url");
      cancel = cleanup;
      if (request.signal.aborted) {
        close();
        return;
      }
      request.signal.addEventListener("abort", close, { once: true });

      controller.enqueue(encoder.encode("retry: 1000\n\n"));
      const currentId = eventId();
      if (lastEventId === currentId) send("pulse");
      else send("update", currentId);
      timer = setInterval(() => {
        if (closed) return;
        if (Date.now() >= expiresAt) {
          close();
          return;
        }
        try {
          const viewer = findSessionAccount(token);
          if (!viewer || viewer.id !== account.id || viewer.role !== account.role || !canSubscribe(viewer)) {
            send("session-ended");
            close();
            return;
          }
          const current = readLiveRevision(viewer, topic);
          if (current !== revision) {
            revision = current;
            send("update", eventId());
          } else if (Date.now() - lastPulse >= PULSE_INTERVAL_MS) {
            lastPulse = Date.now();
            send("pulse");
          }
        } catch {
          close();
        }
      }, CHECK_INTERVAL_MS);
    },
    cancel() {
      cancel();
    },
  });

  return new Response(stream, {
    headers: { ...privateHeaders, "Content-Type": "text/event-stream; charset=utf-8", "X-Accel-Buffering": "no" },
  });
}
