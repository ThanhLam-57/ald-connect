"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Role } from "../lib/auth-store";

const iconPaths = {
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M16 5a3 3 0 0 1 0 6m1 2a5 5 0 0 1 4 5v2" /></>,
  feed: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8m-8 4h5" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Zm4 9v5m-4 2h8M8 6H4v2a3 3 0 0 0 4 3m8-5h4v2a3 3 0 0 1-4 3" /></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1m-4 6v-3h2v3" /></>,
  message: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.5-3A7.5 7.5 0 1 1 20 11.5ZM9 11h7m-7 4h4" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

type NavPage = { href: string; label: string; icon: keyof typeof iconPaths; roles: Role[]; managerOnly?: boolean };

const pages: NavPage[] = [
  { href: "/cong-dong", label: "Cộng đồng", icon: "feed", roles: ["ADMIN", "HCNS", "LIVE"] },
  { href: "/ban-tin", label: "Thông báo HCNS", icon: "feed", roles: ["ADMIN", "HCNS", "LIVE"] },
  { href: "/dong-nghiep", label: "Đồng nghiệp", icon: "people", roles: ["ADMIN", "HCNS", "LIVE"] },
  { href: "/tin-nhan", label: "Tin nhắn", icon: "message", roles: ["ADMIN", "HCNS", "LIVE"] },
  { href: "/co-so-cua-toi", label: "Cơ sở của tôi", icon: "people", roles: ["LIVE"], managerOnly: true },
  { href: "/tai-khoan", label: "Tài khoản", icon: "building", roles: ["ADMIN", "HCNS"] },
  { href: "/bang-xep-hang/co-so", label: "BXH cơ sở", icon: "trophy", roles: ["ADMIN", "LIVE"] },
  { href: "/bang-xep-hang/toan-ald", label: "BXH toàn ALD", icon: "building", roles: ["ADMIN", "LIVE"] },
  { href: "/gop-y", label: "Góp ý & hỗ trợ", icon: "message", roles: ["ADMIN", "HCNS", "LIVE"] },
];

const mobileTabs = ["/cong-dong", "/tin-nhan", "/dong-nghiep"];

function NavIcon({ icon }: { icon: keyof typeof iconPaths }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[icon]}
    </svg>
  );
}

export function Navigation({ role, isBranchManager = false }: { role: Role; isBranchManager?: boolean }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  const available = pages.filter((page) => page.roles.includes(role) && (!page.managerOnly || isBranchManager));
  const primary = mobileTabs.flatMap((href) => available.filter((page) => page.href === href));
  const secondary = available.filter((page) => !mobileTabs.includes(page.href));
  const isCurrent = (page: NavPage) => pathname === page.href || pathname.startsWith(page.href + "/");

  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      const element = menu.current;
      if (element?.open && event.target instanceof Node && !element.contains(event.target)) element.open = false;
    }
    function escape(event: KeyboardEvent) {
      const element = menu.current;
      if (event.key === "Escape" && element?.open) {
        element.open = false;
        element.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function renderLink(page: NavPage, closeMenu = false) {
    return (
      <Link key={page.href} href={page.href} aria-current={isCurrent(page) ? "page" : undefined}
        onClick={closeMenu ? () => { if (menu.current) menu.current.open = false; } : undefined}>
        <NavIcon icon={page.icon} />
        <span>{page.label}</span>
      </Link>
    );
  }

  return (
    <>
      <nav className="main-nav" aria-label="Điều hướng chính">
        {available.map((page) => renderLink(page))}
      </nav>
      <nav className="mobile-nav" aria-label="Điều hướng chính">
        {primary.map((page) => renderLink(page))}
        <details ref={menu} className="mobile-menu" data-current={secondary.some(isCurrent)}>
          <summary><NavIcon icon="menu" /><span>Menu</span></summary>
          <div className="mobile-menu-panel">
            {secondary.map((page) => renderLink(page, true))}
          </div>
        </details>
      </nav>
    </>
  );
}
