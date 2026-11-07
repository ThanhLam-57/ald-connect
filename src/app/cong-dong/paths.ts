export const communityFeedPath = "/cong-dong";

export function communityPostPath(postId: string) {
  return communityFeedPath + "/" + postId;
}

export function communityFeedHref(page = 1, postId?: string, commentsPage = 1, notice?: string) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (postId) {
    params.set("post", postId);
    if (commentsPage > 1) params.set("commentsPage", String(commentsPage));
  }
  if (notice) params.set("notice", notice);
  return communityFeedPath + (params.size ? "?" + params.toString() : "");
}
