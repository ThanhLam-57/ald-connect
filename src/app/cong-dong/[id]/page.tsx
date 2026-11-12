import type { Metadata } from "next";
import Link from "next/link";
import { RefreshOnLiveUpdates } from "../../live-updates";
import { notFound } from "next/navigation";
import { recordAdminReview } from "../../../lib/admin-review";
import { requireActiveAccount } from "../../../lib/auth";
import { getAnonymousCommunityIdentities, getCommunityPost, listCommunityComments, parseCommunityPage } from "../../../lib/community";
import { isContentId } from "../../../lib/content";
import { CommunityComments, CommunityNotice, CommunityPostCard } from "../community-ui";
import { communityFeedPath } from "../paths";
import styles from "../community.module.css";

export const metadata: Metadata = { title: "Thảo luận" };

export default async function CommunityThread({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; notice?: string | string[] }>;
}) {
  const account = await requireActiveAccount();
  const [{ id }, { page: requestedPage, notice }] = await Promise.all([params, searchParams]);
  if (!isContentId(id)) notFound();
  const post = getCommunityPost(account, id);
  if (!post) notFound();

  const page = parseCommunityPage(requestedPage);
  const { items, hasNext } = listCommunityComments(account, id, page);
  const anonymousCommentIds = items.filter((item) => item.isAnonymous).map((item) => item.id);
  const identities = account.role === "ADMIN" && (post.isAnonymous || anonymousCommentIds.length > 0)
    ? getAnonymousCommunityIdentities(account, id, anonymousCommentIds)
    : null;
  if (identities?.post || identities?.comments.size) recordAdminReview(account, "community", post.id);

  return (
    <div className={styles.page}>
      <RefreshOnLiveUpdates topic="community" />
      <header>
        <Link href={communityFeedPath} className={styles.back}>← Cộng đồng ALD</Link>
        <h1 className="page-title">Thảo luận</h1>
      </header>
      <CommunityNotice notice={notice} />
      <CommunityPostCard account={account} post={post} adminIdentity={identities?.post}>
        <CommunityComments account={account} post={post} entries={items} page={page} hasNext={hasNext} adminIdentities={identities?.comments} />
      </CommunityPostCard>
    </div>
  );
}
