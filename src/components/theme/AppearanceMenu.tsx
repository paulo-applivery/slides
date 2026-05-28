"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icons } from "@/components/ui/Icon";
import { useAppearance, type ThemePref } from "./ThemeProvider";

/**
 * Topbar trigger + popover for the app-shell theme.
 *
 * After the appearance rework this only controls light / dark / system for
 * pages that don't carry their own theme. Per-dashboard theme and per-slide
 * flair (background / glass / brand) are set on the dashboard and in the
 * slideshow editor respectively.
 */
export function AppearanceMenu() {
  const { appearance, setAppearance } = useAppearance();
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="widget-iconbtn"
          aria-label="Appearance settings"
          title="Appearance"
          style={{ width: 32, height: 32 }}
        >
          <Icons.Settings size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          style={{
            width: 280,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-md)",
            padding: 16,
            zIndex: 80,
          }}
        >
          <div className="t-h4" style={{ marginBottom: 14 }}>
            Appearance
          </div>

          <SectionLabel>Theme</SectionLabel>
          <Segmented<ThemePref>
            value={appearance.theme}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "system", label: "System" },
            ]}
            onChange={(theme) => setAppearance({ theme })}
          />
          <p
            className="t-small"
            style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 11 }}
          >
            Applies to the app shell. Each dashboard carries its own light/dark,
            and slide backgrounds are set in the slideshow editor.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        fontWeight: 500,
        marginBottom: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 2,
        gap: 2,
        width: "100%",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: "7px 10px",
              background: active ? "var(--bg)" : "transparent",
              border: "1px solid",
              borderColor: active ? "var(--border-strong)" : "transparent",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
