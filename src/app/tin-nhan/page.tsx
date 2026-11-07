import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionToken, requireActiveAccount } from "../../lib/auth";
import { isContentId } from "../../lib/content";
import {
  canUseMessages, listConversations, listMessageContacts, MAX_MESSAGE_LENGTH, MessageError, readConversation,
  type ConversationHistory,
} from "../../lib/messages";
import { AdminMessages } from "./admin-messages";
import { MessageCenter } from "./message-center";

export const metadata: Metadata = { title: "Tin nhắn" };

type PageParams = {
  nguoi?: string | string[];
  cuocTroChuyen?: string | string[];
  truoc?: string | string[];
  danhSachTruoc?: string | string[];
};

export default async function MessagesPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const params = await searchParams;
  const token = await getSessionToken();
  const account = await requireActiveAccount();
  if (account.role === "ADMIN") return <AdminMessages account={account} params={params} />;
  if (!canUseMessages(account)) redirect("/");

  const { nguoi, cuocTroChuyen } = params;
  const selection = isContentId(cuocTroChuyen) && nguoi === undefined ? { conversationId: cuocTroChuyen }
    : isContentId(nguoi) && cuocTroChuyen === undefined ? { peerId: nguoi } : null;
  let initial: ConversationHistory | null = null;
  let error = "";
  if (selection) {
    try {
      initial = readConversation(account, selection);
    } catch (failure) {
      if (!(failure instanceof MessageError) || failure.status !== 404) throw failure;
      error = failure.message;
    }
  } else if (nguoi !== undefined || cuocTroChuyen !== undefined) {
    error = "Không tìm thấy cuộc trò chuyện hoặc đồng nghiệp.";
  }

  return (
    <MessageCenter
      key={`${account.id}:${initial?.peer.id ?? (error || "inbox")}`}
      accountId={account.id}
      initial={initial}
      initialInbox={listConversations(account)}
      initialContacts={listMessageContacts(token)}
      initialError={error}
      maxLength={MAX_MESSAGE_LENGTH}
    />
  );
}
