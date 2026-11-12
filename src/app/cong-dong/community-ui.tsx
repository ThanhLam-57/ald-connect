import Link from "next/link";
import type { Account } from "../../lib/auth";
import {
  canWriteCommunity,
  COMMENT_LIMIT,
  type AnonymousCommunityIdentity,
  type CommunityEntry,
  type CommunityPost,
  POST_LIMIT,
} from "../../lib/community";
import { contentDate } from "../../lib/content";
import { changeCommunityEntry, submitCommunityComment, submitCommunityLike } from "./actions";
import { communityFeedHref, communityPostPath } from "./paths";
import { SubmitButton } from "./submit-button";
import styles from "./community.module.css";

export function CommunityAvatar({ name, compact = false }: { name: string | null; compact?: boolean }) {
  if (name === null) {
    return (
      <span className={styles.avatar} data-compact={compact || undefined} data-anonymous aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 20c.5-3.4 3.2-5.5 7-5.5s6.5 2.1 7 5.5" />
        </svg>
      </span>
    );
  }
  const initials = name.trim().split(/\s+/u).slice(-2)
    .map((part) => Array.from(part)[0] ?? "").join("").toLocaleUpperCase("vi");
  const tone = (name.codePointAt(0) ?? 0) % 3;
  return (
    <span className={styles.avatar} data-compact={compact || undefined} data-tone={tone} aria-hidden="true">
      {initials || "A"}
    </span>
  );
}

export function CommunityVisibility({ anonymous = false }: { anonymous?: boolean }) {
  return (
    <fieldset className={styles.visibility}>
      <legend>Cách hiển thị tên</legend>
      <div className={styles.visibilityOptions}>
        <label>
          <input type="radio" name="visibility" value="named" defaultChecked={!anonymous} />
          <span>Hiện tên</span>
        </label>
        <label>
          <input type="radio" name="visibility" value="anonymous" defaultChecked={anonymous} />
          <span>Ẩn danh</span>
        </label>
      </div>
      <p className={styles.visibilityHint}>Khi chọn Ẩn danh, chỉ Admin có thể xem danh tính tác giả.</p>
    </fieldset>
  );
}

function EntryByline({
  entry,
  compact,
  adminIdentity,
  reviewHref,
}: {
  entry: CommunityEntry;
  compact?: boolean;
  adminIdentity?: AnonymousCommunityIdentity;
  reviewHref?: string;
}) {
  const name = entry.isAnonymous ? null : entry.authorName ?? "Thành viên ALD";
  return (
    <header className={styles.byline}>
      <CommunityAvatar name={name} compact={compact} />
      <div>
        <strong>{name ?? "Ẩn danh"}</strong>
        <div className={styles.entryMeta}>
          {!entry.isAnonymous && <span>{entry.branchName ?? (entry.authorRole === "HCNS" ? "Văn phòng" : "Cơ sở chưa xác định")}</span>}
          <time dateTime={new Date(entry.createdAt).toISOString()}>{contentDate(entry.createdAt)}</time>
          {entry.updatedAt > entry.createdAt && <span>Đã sửa</span>}
          {entry.hiddenAt !== null && <span className={styles.hiddenBadge}>Đã ẩn</span>}
        </div>
        {adminIdentity && (
          <div className={styles.adminIdentity}>
            <span>Danh tính tác giả · Chỉ Admin</span>
            <strong>{adminIdentity.displayName}</strong>
            <span>@{adminIdentity.username}{adminIdentity.branchName && <> · {adminIdentity.branchName}</>}</span>
          </div>
        )}
        {reviewHref && (
          <Link className={styles.identityReview} href={reviewHref} prefetch={false}>Xem danh tính · Admin</Link>
        )}
      </div>
    </header>
  );
}

const notices = {
  posted: "Đã đăng bài viết.",
  deleted: "Đã xóa bài viết.",
  commented: "Đã gửi bình luận.",
  "comment-removed": "Đã xóa bình luận.",
  edited: "Đã lưu thay đổi.",
  hidden: "Đã ẩn nội dung khỏi cộng đồng.",
  unhidden: "Đã hiện lại nội dung trong cộng đồng.",
  invalid: "Kiểm tra lại nội dung và giới hạn ký tự.",
} as const;

export function CommunityNotice({ notice }: { notice?: string | string[] }) {
  if (typeof notice !== "string" || !Object.hasOwn(notices, notice)) return null;
  return (
    <p className={styles.notice} role={notice === "invalid" ? "alert" : "status"}>
      {notices[notice as keyof typeof notices]}
    </p>
  );
}

export function CommunityPagination({
  href,
  page,
  hasNext,
  comments = false,
  prefetch,
}: {
  href: (page: number) => string;
  page: number;
  hasNext: boolean;
  comments?: boolean;
  prefetch?: false;
}) {
  if (page <= 1 && !hasNext) return null;
  return (
    <nav aria-label={comments ? "Trang bình luận" : "Trang cộng đồng"} className={styles.pagination}>
      {page > 1 && <Link href={href(page - 1)} scroll={!comments} prefetch={prefetch}>{comments ? "Bình luận mới hơn" : "Trang trước"}</Link>}
      <span>Trang {page}</span>
      {hasNext && <Link href={href(page + 1)} scroll={!comments} prefetch={prefetch}>{comments ? "Bình luận cũ hơn" : "Trang sau"}</Link>}
    </nav>
  );
}

type PostPosition = { postId: string; feedPage?: number; commentsPage?: number };

function PostFields({ postId, feedPage, commentsPage }: PostPosition) {
  return (
    <>
      <input type="hidden" name="post" value={postId} />
      {feedPage !== undefined && (
        <>
          <input type="hidden" name="returnTo" value="feed" />
          <input type="hidden" name="feedPage" value={feedPage} />
        </>
      )}
      {commentsPage !== undefined && <input type="hidden" name="commentsPage" value={commentsPage} />}
    </>
  );
}

function EntryOptions({
  account,
  entry,
  position,
  parentVisible,
  comment,
}: {
  account: Account;
  entry: CommunityEntry;
  position: PostPosition;
  parentVisible: boolean;
  comment?: boolean;
}) {
  const canHide = account.role === "ADMIN";
  const canEdit = parentVisible && canWriteCommunity(account) && entry.isOwn;
  const hidden = entry.hiddenAt !== null;
  if (hidden ? !canHide : !canHide && !canEdit) return null;

  const target = (
    <>
      <PostFields {...position} />
      {comment && <input type="hidden" name="comment" value={entry.id} />}
    </>
  );
  const label = comment ? "bình luận" : "bài viết";
  const inputId = "edit-" + entry.id;

  return (
    <details className={styles.options} key={entry.updatedAt}>
      <summary className={styles.optionsTrigger} aria-label={"Tùy chọn " + label}>
        <span aria-hidden="true">⋯</span>
      </summary>
      <div className={styles.optionsPanel}>
        {canHide ? (
          <form action={changeCommunityEntry}>
            {target}
            {hidden
              ? <SubmitButton className={styles.secondary} name="intent" value="unhide">Hiện lại {label}</SubmitButton>
              : <SubmitButton className={styles.secondary} name="intent" value="hide">Ẩn {label}</SubmitButton>}
          </form>
        ) : (
          <>
            <details className={styles.editForm}>
              <summary>Sửa {label}</summary>
              <form action={changeCommunityEntry} className={styles.form}>
                {target}
                <label htmlFor={inputId}>Nội dung {label} đã sửa</label>
                <textarea id={inputId} name="body" defaultValue={entry.body} maxLength={comment ? COMMENT_LIMIT : POST_LIMIT} rows={3} required />
                <CommunityVisibility anonymous={entry.isAnonymous} />
                <div className={styles.formActions}>
                  <SubmitButton className={styles.primary} name="intent" value="edit">Lưu thay đổi</SubmitButton>
                </div>
              </form>
            </details>
            <form action={changeCommunityEntry}>
              {target}
              <SubmitButton className={styles.danger} name="intent" value="delete">Xóa {label}</SubmitButton>
            </form>
          </>
        )}
      </div>
    </details>
  );
}

function ActionIcon({ type }: { type: "like" | "comment" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {type === "like" ? (
        <path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3Zm0 0 4-7c2 0 3 1.4 2.5 4l-.5 3h5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 16.7 20H7" />
      ) : (
        <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l1.7-3.4A8.5 8.5 0 1 1 21 11.5Z" />
      )}
    </svg>
  );
}

export function CommunityPostCard({
  account,
  post,
  feedPage,
  commentsOpen = false,
  adminIdentity,
  children,
}: {
  account: Account;
  post: CommunityPost;
  feedPage?: number;
  commentsOpen?: boolean;
  adminIdentity?: AnonymousCommunityIdentity;
  children?: React.ReactNode;
}) {
  const onFeed = feedPage !== undefined;
  const admin = account.role === "ADMIN";
  const commentsId = "comments-" + post.id;
  const canLike = canWriteCommunity(account) && post.hiddenAt === null;
  const commentsHref = onFeed
    ? communityFeedHref(feedPage, commentsOpen ? undefined : post.id)
    : "#" + commentsId;
  return (
    <article className={styles.card} id={"post-" + post.id}>
      <EntryByline entry={post} adminIdentity={admin ? adminIdentity : undefined} />
      <EntryOptions account={account} entry={post} position={{ postId: post.id, feedPage }} parentVisible={post.hiddenAt === null} />
      <p className={styles.body}>{post.body}</p>
      <div className={styles.stats}>
        <span>{post.likeCount} lượt thích</span>
        <span>{post.commentCount} bình luận</span>
        {onFeed && (
          <Link href={communityPostPath(post.id)} prefetch={admin ? false : undefined}>
            {admin && post.isAnonymous ? "Mở bài viết để xem danh tính" : "Mở bài viết"}
          </Link>
        )}
      </div>
      <div className={styles.postActions}>
        {canLike && (
          <form action={submitCommunityLike}>
            <input type="hidden" name="post" value={post.id} />
            <input type="hidden" name="liked" value={post.viewerLiked ? "no" : "yes"} />
            <SubmitButton className={styles.postAction} aria-pressed={Boolean(post.viewerLiked)}>
              <ActionIcon type="like" /> Thích
            </SubmitButton>
          </form>
        )}
        <Link
          className={styles.postAction}
          href={commentsHref}
          scroll={!onFeed}
          aria-expanded={onFeed ? commentsOpen : undefined}
          aria-controls={!onFeed || commentsOpen ? commentsId : undefined}
        >
          <ActionIcon type="comment" /> {onFeed && commentsOpen ? "Ẩn bình luận" : "Bình luận"}
        </Link>
      </div>
      {children}
    </article>
  );
}

export function CommunityComments({
  account,
  post,
  entries,
  page,
  hasNext,
  feedPage,
  adminIdentities,
}: {
  account: Account;
  post: CommunityPost;
  entries: CommunityEntry[];
  page: number;
  hasNext: boolean;
  feedPage?: number;
  adminIdentities?: ReadonlyMap<string, AnonymousCommunityIdentity>;
}) {
  const position: PostPosition = { postId: post.id, feedPage, commentsPage: page };
  const visible = post.hiddenAt === null;
  const admin = account.role === "ADMIN";
  const onFeed = feedPage !== undefined;
  const threadPageHref = (threadPage: number) => communityPostPath(post.id) + (threadPage > 1 ? "?page=" + threadPage : "");
  return (
    <section id={"comments-" + post.id} aria-label="Bình luận" className={styles.comments}>
      {canWriteCommunity(account) && visible && (
        <form action={submitCommunityComment} className={styles.commentComposer}>
          <PostFields {...position} />
          <CommunityAvatar name={account.displayName} compact />
          <div className={styles.commentInput}>
            <label className={styles.srOnly} htmlFor={"comment-input-" + post.id}>Nội dung bình luận</label>
            <textarea id={"comment-input-" + post.id} name="body" placeholder="Viết bình luận…" rows={2} maxLength={COMMENT_LIMIT} required />
            <CommunityVisibility />
          </div>
          <SubmitButton className={styles.primary}>Gửi bình luận</SubmitButton>
        </form>
      )}
      {entries.length === 0 && <p className={styles.empty}>Chưa có bình luận trên trang này.</p>}
      {entries.map((entry) => (
        <article className={styles.comment} id={"comment-" + entry.id} key={entry.id}>
          <EntryByline
            entry={entry}
            compact
            adminIdentity={admin ? adminIdentities?.get(entry.id) : undefined}
            reviewHref={admin && onFeed && entry.isAnonymous ? threadPageHref(page) + "#comment-" + entry.id : undefined}
          />
          <EntryOptions account={account} entry={entry} position={position} parentVisible={visible} comment />
          <p className={styles.commentBody}>{entry.body}</p>
        </article>
      ))}
      <CommunityPagination
        comments
        href={(nextPage) => feedPage === undefined
          ? threadPageHref(nextPage)
          : communityFeedHref(feedPage, post.id, nextPage)}
        page={page}
        hasNext={hasNext}
        prefetch={admin && !onFeed ? false : undefined}
      />
    </section>
  );
}
