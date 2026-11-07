"use client";

import Link from "next/link";
import { useState } from "react";
import type { RankEntry, RankScope } from "./ranking-data";
import { useLeaderboard } from "./use-leaderboard";
import styles from "./ranking.module.css";

const formatCoins = new Intl.NumberFormat("vi-VN");
const formatTime = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});

type DisplayRank = RankEntry & { initials: string };

function initialsFor(name: string) {
  return name.trim().split(/\s+/).slice(-2)
    .map((word) => Array.from(word)[0] ?? "").join("").toLocaleUpperCase("vi");
}

function Trophy() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 3.5h9v7a4.5 4.5 0 0 1-9 0v-7Z" />
      <path d="M7.5 5.5H4v2.75A3.25 3.25 0 0 0 7.5 11.5m9-6H20v2.75a3.25 3.25 0 0 1-3.5 3.25M12 15v4m-4 1.5h8" />
    </svg>
  );
}

function CoinAmount({ coins }: { coins: string }) {
  return (
    <span className={styles.coinAmount}>
      {formatCoins.format(BigInt(coins))} <span className={styles.coinUnit}>xu</span>
    </span>
  );
}

function Podium({ entries }: { entries: DisplayRank[] }) {
  return (
    <ol className={styles.podium} aria-label="Ba vị trí dẫn đầu">
      {entries.map((entry) => (
        <li className={styles.podiumCard} data-rank={entry.rank} key={entry.rank}>
          <span className={styles.medal}>Hạng {entry.rank}</span>
          <span className={styles.podiumAvatar} aria-hidden="true">{entry.initials}</span>
          <div className={styles.podiumIdentity}>
            <strong>{entry.name}</strong>
            <span>{entry.branchName}</span>
          </div>
          <CoinAmount coins={entry.coins} />
        </li>
      ))}
    </ol>
  );
}

function RankList({ entries }: { entries: DisplayRank[] }) {
  return (
    <section className={styles.listPanel} aria-labelledby="rank-list-title">
      <div className={styles.listHeading}>
        <h2 id="rank-list-title">Hạng 4 đến 10</h2>
        <p>Các vị trí tiếp theo trên bảng toàn ALD</p>
      </div>
      <table className={styles.rankTable} aria-labelledby="rank-list-title">
        <thead>
          <tr>
            <th scope="col">Hạng</th>
            <th scope="col">Nhân viên</th>
            <th scope="col" className={styles.facilityColumn}>Cơ sở</th>
            <th scope="col">Doanh số</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.rank}>
              <td className={styles.rankNumber}>{String(entry.rank).padStart(2, "0")}</td>
              <td>
                <div className={styles.tableIdentity}>
                  <span className={styles.tableAvatar} aria-hidden="true">
                    {entry.initials}
                  </span>
                  <div>
                    <strong>{entry.name}</strong>
                    <span className={styles.mobileFacility}>{entry.branchName}</span>
                  </div>
                </div>
              </td>
              <td className={styles.facilityColumn}>{entry.branchName}</td>
              <td><CoinAmount coins={entry.coins} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function RankBoard({ scope, canChooseBranch = false }: { scope: RankScope; canChooseBranch?: boolean }) {
  const [branchId, setBranchId] = useState("");
  const isFacility = scope === "facility";
  const endpoint = `${process.env.NEXT_PUBLIC_CONNECT_BASE_PATH ?? ""}/api/ranking`;
  const { current, retry, branches } = useLeaderboard(endpoint, scope, branchId);
  const data = current?.data;
  const status = current?.status;
  const ranking: DisplayRank[] = (data?.entries ?? []).map((entry) => ({
    ...entry,
    initials: initialsFor(entry.name),
  }));
  const [year, month] = data?.businessDate.split("-") ?? [];
  const viewer = data?.viewer;
  const facilityDescription = canChooseBranch
    ? "Chọn cơ sở để xem ba vị trí dẫn đầu doanh số xu."
    : "Ba gương mặt dẫn đầu doanh số xu tại cơ sở của bạn.";

  return (
    <section className={styles.page} aria-labelledby="ranking-title">
      <header className={styles.pageHeader}>
        <p className="page-kicker">THÀNH TÍCH LIVE</p>
        <h1 id="ranking-title" className="page-title">
          {isFacility ? "Bảng xếp hạng cơ sở" : "Bảng xếp hạng toàn ALD"}
        </h1>
        <p className="page-description">
          {isFacility
            ? facilityDescription
            : "Mười vị trí dẫn đầu doanh số xu trên toàn công ty."}
        </p>
      </header>

      <div className={styles.controls}>
        <nav aria-label="Chọn bảng xếp hạng" className={styles.scopeNav}>
          <Link href="/bang-xep-hang/co-so" aria-current={isFacility ? "page" : undefined}>
            Cơ sở
          </Link>
          <Link href="/bang-xep-hang/toan-ald" aria-current={isFacility ? undefined : "page"}>
            Toàn ALD
          </Link>
        </nav>
        {canChooseBranch && isFacility && branches && branches.length > 0 && (
          <label className={styles.facilityFilter}>
            <span>Cơ sở</span>
            <select value={branchId || data?.branch?.id || branches[0].id} onChange={(event) => setBranchId(event.currentTarget.value)}>
              {branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <section className={styles.stage} aria-labelledby="ranking-stage-title">
        <div className={styles.stageHeading}>
          <div className={styles.stageLead}>
            <span className={styles.trophyIcon}><Trophy /></span>
            <div>
              <p className={styles.stageKicker}>{isFacility ? "TOP 3 CƠ SỞ" : "TOP 10 TOÀN ALD"}</p>
              <h2 id="ranking-stage-title">{isFacility ? data?.branch?.name ?? "Cơ sở" : "Toàn ALD"}</h2>
            </div>
          </div>
          <div className={styles.stageMeta} aria-live="polite" aria-atomic="true">
            <span className={styles.demoBadge}>Dữ liệu Workforce</span>
            {data && <span>Tháng {month}/{year}</span>}
          </div>
        </div>

        {ranking.length > 0 && <Podium entries={ranking.slice(0, 3)} />}
        <div className={styles.stageStatus} aria-live="polite">
            {!current && <p>Đang tải bảng xếp hạng…</p>}
            {data?.branchBreakdownUnavailable && <p>Workforce chưa cung cấp số xu tách theo cơ sở cho kỳ này.</p>}
            {status === "ready" && ranking.length === 0 && !data?.branchBreakdownUnavailable &&
              <p>Chưa có doanh số xu trong kỳ này.</p>}
            {status === "sign-in" && <>
              <p>Phiên đăng nhập đã kết thúc.</p>
              <Link href="/dang-nhap">Đăng nhập ALD Connect</Link>
            </>}
            {status === "forbidden" && <p>Tài khoản của bạn chưa có quyền xem bảng xếp hạng này.</p>}
            {status === "unavailable" && <>
              <p>{data ? "Chậm cập nhật. Đang hiển thị số liệu gần nhất." : "Tạm thời chưa lấy được số liệu từ Workforce."}</p>
              <button type="button" onClick={retry}>Thử lại</button>
            </>}
            {data && <p className={styles.updatedAt}>Cập nhật lúc {formatTime.format(new Date(data.asOf))}</p>}
        </div>
      </section>

      {!isFacility && ranking.length > 3 && <RankList entries={ranking.slice(3)} />}

      {viewer && <div className={styles.viewer}>
        <strong>Thành tích của bạn</strong>
        <p>Hạng {viewer.rank} · <CoinAmount coins={viewer.coins} /></p>
        {viewer.nextCoins !== null && <p>
          {viewer.nextCoins === viewer.coins
            ? "Bạn đang bằng xu với hạng ngay trên."
            : <>Cách hạng ngay trên <CoinAmount coins={String(BigInt(viewer.nextCoins) - BigInt(viewer.coins))} />.</>}
        </p>}
      </div>}
      {data && <p className={styles.note}>
        <span aria-hidden="true">ⓘ</span> Số liệu tháng hiện tại từ Workforce. Bảng hiển thị nhân viên có doanh số xu.
      </p>}
    </section>
  );
}
