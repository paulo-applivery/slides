"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icons, type IconName } from "@/components/ui/Icon";

/**
 * Client-side nav rail. `footer` is a server-rendered slot for the
 * "Data sources" panel (which needs DB access — see DataSourcesFooter).
 */

type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

const PRIMARY: NavItem[] = [
  { href: "/dashboards", label: "Dashboards", icon: "Dashboard" },
  { href: "/slideshows", label: "Slideshows", icon: "Slideshow" },
  { href: "/tv", label: "TV mode", icon: "TV" },
];

const SECONDARY: NavItem[] = [
  { href: "/queries", label: "Queries", icon: "Query" },
  { href: "/integrations", label: "Integrations", icon: "Plug" },
  { href: "/settings", label: "Settings", icon: "Settings" },
];

export function Sidebar({ footer }: { footer?: ReactNode }) {
  const path = usePathname();
  const isActive = (href: string) => path?.startsWith(href) ?? false;

  return (
    <aside className="sb">
      <Link href="/dashboards" className="sb-brand" style={{ textDecoration: "none" }}>
        <div className="sb-brand-mark">
          <svg width="14" height="14" viewBox="0 0 70 70" fill="white" aria-hidden="true">
            <path d="M35 0 L70 60 L55 56 L35 22 L15 56 L0 60 Z" />
            <path d="M35 36 L45 56 L35 53 L25 56 Z" />
          </svg>
        </div>
        <div className="sb-brand-text">
          <strong>Applivery</strong>
          <span>Atlas</span>
        </div>
      </Link>

      <div className="sb-section">Workspace</div>
      {PRIMARY.map((it) => {
        const I = Icons[it.icon];
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`sb-item ${active ? "active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            <I size={16} variant={active ? "bold" : "outline"} />
            {it.label}
          </Link>
        );
      })}

      <div className="sb-section">Data</div>
      {SECONDARY.map((it) => {
        const I = Icons[it.icon];
        const active = isActive(it.href);
        // Settings stays disabled until Phase 5 builds the page; everything
        // else in the Data rail is live now.
        const isLive = it.href === "/integrations" || it.href === "/queries";
        if (isLive) {
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`sb-item ${active ? "active" : ""}`}
              style={{ textDecoration: "none" }}
            >
              <I size={16} variant={active ? "bold" : "outline"} />
              {it.label}
            </Link>
          );
        }
        return (
          <button key={it.href} className="sb-item" disabled type="button">
            <I size={16} variant="outline" />
            {it.label}
          </button>
        );
      })}

      <div className="sb-foot">
        <div className="sb-foot-title">Data sources</div>
        {footer}
      </div>
    </aside>
  );
}
