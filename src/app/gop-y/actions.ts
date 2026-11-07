"use server";

import { notFound, redirect } from "next/navigation";
import { requireActiveAccount } from "../../lib/auth";
import {
  claimFeedback,
  closeFeedback,
  createFeedback,
  formText,
  isContentId,
  replyToFeedback,
} from "../../lib/content";

const feedbackPath = "/gop-y";

export async function submitFeedback(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role !== "LIVE") notFound();
  const category = formText(form, "category", 30);
  const title = formText(form, "title", 80);
  const body = formText(form, "body", 2000);
  const id = category && title && body ? createFeedback(account, category, title, body) : null;
  if (!id) redirect(feedbackPath + "?notice=invalid");
  redirect(feedbackPath + "?ticket=" + id + "&notice=sent");
}

export async function takeFeedback(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role !== "HCNS") notFound();
  const id = form.get("ticket");
  if (!isContentId(id) || !claimFeedback(account, id)) {
    redirect(feedbackPath + "?notice=unavailable");
  }
  redirect(feedbackPath + "?ticket=" + id);
}

export async function sendFeedbackReply(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role === "ADMIN") notFound();
  const id = form.get("ticket");
  if (!isContentId(id)) redirect(feedbackPath + "?notice=unavailable");
  const body = formText(form, "body", 2000);
  if (!body) redirect(feedbackPath + "?ticket=" + id + "&notice=invalid");
  if (!replyToFeedback(account, id, body)) redirect(feedbackPath + "?notice=unavailable");
  redirect(feedbackPath + "?ticket=" + id);
}

export async function completeFeedback(form: FormData) {
  const account = await requireActiveAccount();
  if (account.role !== "HCNS") notFound();
  const id = form.get("ticket");
  if (!isContentId(id) || !closeFeedback(account, id)) {
    redirect(feedbackPath + "?notice=unavailable");
  }
  redirect(feedbackPath + "?ticket=" + id);
}
