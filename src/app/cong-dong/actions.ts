"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireActiveAccount } from "../../lib/auth";
import { formText, isContentId } from "../../lib/content";
import {
  canWriteCommunity,
  changeOwnCommunityEntry,
  COMMENT_LIMIT,
  createCommunityComment,
  createCommunityPost,
  hideCommunityEntry,
  parseCommunityPage,
  POST_LIMIT,
  setCommunityPostLike,
} from "../../lib/community";
import { communityFeedHref, communityFeedPath, communityPostPath } from "./paths";

function readPage(form: FormData, name: string) {
  const value = form.get(name);
  return parseCommunityPage(typeof value === "string" ? value : undefined);
}

function readVisibility(form: FormData) {
  const values = form.getAll("visibility");
  if (values.length === 0) return undefined;
  if (values.length !== 1) return null;
  if (values[0] === "named") return false;
  if (values[0] === "anonymous") return true;
  return null;
}

function refreshPost(postId: string) {
  revalidatePath(communityFeedPath);
  revalidatePath(communityPostPath(postId));
}

function actionReturn(form: FormData, postId: string, notice: string, firstCommentsPage = false) {
  const onFeed = form.get("returnTo") === "feed";
  const commentsPage = firstCommentsPage ? 1 : readPage(form, "commentsPage");
  if (onFeed) return communityFeedHref(readPage(form, "feedPage"), postId, commentsPage, notice);
  const params = new URLSearchParams({ notice });
  if (commentsPage > 1) params.set("page", String(commentsPage));
  return communityPostPath(postId) + "?" + params.toString();
}

export async function submitCommunityPost(form: FormData) {
  const account = await requireActiveAccount();
  if (!canWriteCommunity(account)) notFound();
  const body = formText(form, "body", POST_LIMIT);
  const isAnonymous = readVisibility(form);
  const id = body && isAnonymous !== null ? createCommunityPost(account, body, isAnonymous) : null;
  if (!id) redirect(communityFeedHref(1, undefined, 1, "invalid"));
  revalidatePath(communityFeedPath);
  redirect(communityFeedHref(1, undefined, 1, "posted"));
}

export async function submitCommunityComment(form: FormData) {
  const account = await requireActiveAccount();
  if (!canWriteCommunity(account)) notFound();
  const postId = form.get("post");
  if (!isContentId(postId)) notFound();
  const body = formText(form, "body", COMMENT_LIMIT);
  const isAnonymous = readVisibility(form);
  if (!body || isAnonymous === null) redirect(actionReturn(form, postId, "invalid"));
  if (!createCommunityComment(account, postId, body, isAnonymous)) notFound();
  refreshPost(postId);
  redirect(actionReturn(form, postId, "commented", true));
}

export async function submitCommunityLike(form: FormData) {
  const account = await requireActiveAccount();
  const postId = form.get("post");
  const liked = form.get("liked");
  if (!isContentId(postId) || (liked !== "yes" && liked !== "no")) notFound();
  if (!setCommunityPostLike(account, postId, liked === "yes")) notFound();
  refreshPost(postId);
}

export async function changeCommunityEntry(form: FormData) {
  const account = await requireActiveAccount();
  const postId = form.get("post");
  const commentId = form.get("comment");
  const intent = form.get("intent");
  if (!isContentId(postId) || (commentId !== null && !isContentId(commentId))) notFound();

  const target = commentId ? { postId, commentId } : { postId };
  if (intent === "hide") {
    if (!hideCommunityEntry(account, target)) notFound();
    refreshPost(postId);
    redirect(actionReturn(form, postId, "hidden"));
  }
  if (!canWriteCommunity(account) || (intent !== "edit" && intent !== "delete")) notFound();

  const body = intent === "edit" ? formText(form, "body", commentId ? COMMENT_LIMIT : POST_LIMIT) : null;
  const isAnonymous = intent === "edit" ? readVisibility(form) : undefined;
  if (isAnonymous === null || (intent === "edit" && !body)) redirect(actionReturn(form, postId, "invalid"));
  if (!changeOwnCommunityEntry(account, target, body, isAnonymous)) notFound();

  refreshPost(postId);
  if (intent === "delete" && !commentId) {
    redirect(communityFeedHref(readPage(form, "feedPage"), undefined, 1, "deleted"));
  }
  redirect(actionReturn(form, postId, intent === "delete" ? "comment-removed" : "edited"));
}
