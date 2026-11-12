import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-heading">
      <p className="page-kicker">ALD CONNECT / 404</p>
      <h1 id="not-found-heading" className="page-title">Không tìm thấy trang</h1>
      <p className="page-description">
        Trang bạn mở không tồn tại hoặc bạn không có quyền xem. <Link href="/">Về trang chủ</Link>
      </p>
    </section>
  );
}
