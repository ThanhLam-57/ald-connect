import type { Metadata } from "next";
import { requireActiveAccount } from "../../lib/auth";
import { canWriteCommunity, listCommunityComments, listCommunityPosts, parseCommunityPage, POST_LIMIT } from "../../lib/community";
import { isContentId } from "../../lib/content";
import { submitCommunityPost } from "./actions";
import {
  CommunityAvatar,
  CommunityComments,
  CommunityNotice,
  CommunityPagination,
  CommunityPostCard,
  CommunityVisibility,
} from "./community-ui";
import { communityFeedHref } from "./paths";
import { SubmitButton } from "./submit-button";
import styles from "./community.module.css";

export const metadata: Metadata = { title: "Cộng đồng ALD" };

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string | string[];
    post?: string | string[];
    commentsPage?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const account = await requireActiveAccount();
  const { page: requestedPage, post, commentsPage: requestedCommentsPage, notice } = await searchParams;
  const page = parseCommunityPage(requestedPage);
  const commentsPage = parseCommunityPage(requestedCommentsPage);
  const { items, hasNext } = listCommunityPosts(account, page);
  const expandedPost = isContentId(post) ? items.find((entry) => entry.id === post) : undefined;
  const comments = expandedPost ? listCommunityComments(account, expandedPost.id, commentsPage) : null;

  return (
    <div className={styles.page}>
      <header>
        <p className="page-kicker">KÊNH NỘI BỘ ALD</p>
        <h1 className="page-title">Cộng đồng ALD</h1>
        <p className={styles.description}>Chia sẻ kinh nghiệm và trao đổi với đồng nghiệp ở các cơ sở.</p>
      </header>
      <CommunityNotice notice={notice} />

      {canWriteCommunity(account) && (
        <form action={submitCommunityPost} className={`${styles.card} ${styles.composer}`}>
          <CommunityAvatar name={account.displayName} />
          <div className={styles.composerFields}>
            <label className={styles.srOnly} htmlFor="new-community-post">Nội dung bài viết</label>
            <textarea id="new-community-post" name="body" placeholder="Bạn đang nghĩ gì?" maxLength={POST_LIMIT} rows={2} required />
            <CommunityVisibility />
            <div className={styles.formActions}>
              <SubmitButton className={styles.primary}>Đăng bài</SubmitButton>
            </div>
          </div>
        </form>
      )}

      <section aria-labelledby="community-feed-heading" className={styles.stream}>
        <h2 id="community-feed-heading" className={styles.srOnly}>Bài viết mới nhất</h2>
        {items.length === 0 && <p className={styles.empty}>Chưa có bài viết trên trang này.</p>}
        {items.map((entry) => {
          const open = expandedPost?.id === entry.id;
          return (
            <CommunityPostCard account={account} post={entry} feedPage={page} commentsOpen={open} key={entry.id}>
              {open && comments && (
                <CommunityComments account={account} post={entry} entries={comments.items} page={commentsPage} hasNext={comments.hasNext} feedPage={page} />
              )}
            </CommunityPostCard>
          );
        })}
        <CommunityPagination href={(nextPage) => communityFeedHref(nextPage)} page={page} hasNext={hasNext} />
      </section>
    </div>
  );
}
