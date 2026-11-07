import { getSessionToken } from "../../../lib/auth";
import { recordPresence } from "../../../lib/presence";

const headers = { "Cache-Control": "private, no-store" };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin")) return false;
  const configuredUrl = process.env.CONNECT_PUBLIC_URL?.trim();
  if (configuredUrl) return origin === URL.parse(configuredUrl)?.origin;

  const host = request.headers.get("host");
  if (!host) return false;
  const publicUrl = URL.parse(`${new URL(request.url).protocol}//${host}`);
  return origin === publicUrl?.origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403, headers });
  const status = recordPresence(await getSessionToken());
  return new Response(null, { status, headers });
}
