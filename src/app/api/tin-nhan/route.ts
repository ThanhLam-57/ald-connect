import { getSessionToken } from "../../../lib/auth";
import { findSessionAccount } from "../../../lib/auth-store";
import { isContentId } from "../../../lib/content";
import {
  canUseMessages, listConversations, listMessageContacts, markConversationRead, MAX_MESSAGE_LENGTH, MessageError,
  readConversation, sendDirectMessage,
} from "../../../lib/messages";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie" };
const MAX_BODY_BYTES = 16_384;

function response(value: object, status = 200) {
  return Response.json(value, { headers, status });
}

function errorResponse(error: unknown) {
  return error instanceof MessageError
    ? response({ error: error.message }, error.status)
    : response({ error: "Tin nhắn tạm thời không khả dụng. Vui lòng thử lại." }, 503);
}

async function authenticateRequest() {
  const token = await getSessionToken();
  const account = token ? findSessionAccount(token) : null;
  if (!token || !account) throw new MessageError(401, "Phiên đăng nhập đã hết hạn.");
  if (!canUseMessages(account)) throw new MessageError(403, "Tài khoản này không có quyền nhắn tin.");
  return { token, account };
}

function messageId(value: unknown, allowZero = false): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1);
}

export async function GET(request: Request) {
  try {
    const { account, token } = await authenticateRequest();
    const params = new URL(request.url).searchParams;
    const conversationId = params.get("cuocTroChuyen");
    const peerId = params.get("nguoi");
    const beforeParam = params.get("truoc");
    const afterParam = params.get("sau");
    const before = beforeParam === null ? undefined : Number(beforeParam);
    const after = afterParam === null ? undefined : Number(afterParam);
    if (params.size === 0) return response({ conversations: listConversations(account), contacts: listMessageContacts(token) });
    if ((before !== undefined && (!/^\d+$/.test(beforeParam!) || !messageId(before))) ||
        (after !== undefined && (!/^\d+$/.test(afterParam!) || !messageId(after, true))) ||
        (before !== undefined && after !== undefined) ||
        ((conversationId === null) === (peerId === null)) ||
        new Set(params.keys()).size !== params.size ||
        [...params.keys()].some((key) => !["cuocTroChuyen", "nguoi", "truoc", "sau"].includes(key))) {
      return response({ error: "Yêu cầu cuộc trò chuyện không hợp lệ." }, 400);
    }
    const selection = isContentId(conversationId) ? { conversationId } : isContentId(peerId) ? { peerId } : null;
    if (!selection) return response({ error: "Yêu cầu cuộc trò chuyện không hợp lệ." }, 400);
    return response({ history: readConversation(account, selection, { before, after }) });
  } catch (error) {
    return errorResponse(error);
  }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!origin || (site && site !== "same-origin")) return false;
  const configuredUrl = process.env.CONNECT_PUBLIC_URL?.trim();
  if (configuredUrl) return origin === URL.parse(configuredUrl)?.origin;
  const host = request.headers.get("host");
  if (!host) return false;
  return origin === URL.parse(`${new URL(request.url).protocol}//${host}`)?.origin;
}

async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new MessageError(415, "Yêu cầu phải dùng JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new MessageError(400, "Thiếu dữ liệu yêu cầu.");
  let size = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new MessageError(413, "Dữ liệu yêu cầu quá dài.");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MessageError) throw error;
    throw new MessageError(400, "Dữ liệu yêu cầu không hợp lệ.");
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return response({ error: "Yêu cầu nhắn tin phải xuất phát từ ALD Connect." }, 403);
    const { token } = await authenticateRequest();
    const input = await jsonObject(request);
    if (input.action === "send" && Object.keys(input).length === 4 &&
        isContentId(input.recipientId) && isContentId(input.requestId) && typeof input.body === "string") {
      const body = input.body.trim();
      if (!body || body.length > MAX_MESSAGE_LENGTH || body.includes("\0")) {
        return response({ error: `Nhập tin nhắn từ 1 đến ${MAX_MESSAGE_LENGTH} ký tự hợp lệ.` }, 400);
      }
      return response(sendDirectMessage(token, input.recipientId, input.requestId.toLowerCase(), body));
    }
    if (input.action === "read" && Object.keys(input).length === 3 &&
        isContentId(input.conversationId) && messageId(input.messageId)) {
      return response(markConversationRead(token, input.conversationId, input.messageId));
    }
    return response({ error: "Thao tác nhắn tin không hợp lệ." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
