"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Icons, type IconName } from "@/components/ui/Icon";
import { LogoBadge } from "@/components/brand/Logo";

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
        <LogoBadge size={28} />
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
        // Everything in the Data rail is live now.
        const isLive =
          it.href === "/integrations" ||
          it.href === "/queries" ||
          it.href === "/settings";
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
