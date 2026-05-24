"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icons } from "@/components/ui/Icon";
import {
  useAppearance,
  type BackgroundEffect,
  type ThemePref,
} from "./ThemeProvider";

/**
 * Topbar trigger + popover for appearance prefs.
 *
 *  Theme switch (Light / Dark / System) — segmented
 *  Background picker — None / PixelBlast / Soft Aurora / Iridescence
 *  Glass cards — toggle
 *  Brand color — color input
 *
 * All four changes apply instantly via `ThemeProvider`. Persistence is
 * localStorage — see provider doc-block.
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
            width: 320,
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

          {/* Theme */}
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

          {/* Background */}
          <SectionLabel style={{ marginTop: 16 }}>Background effect</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            <BgOption
              active={appearance.background === null}
              onClick={() => setAppearance({ background: null })}
              label="None"
              preview="var(--bg)"
            />
            <BgOption
              active={appearance.background === "pixelBlast"}
              onClick={() =>
                setAppearance({ background: "pixelBlast" as BackgroundEffect })
              }
              label="Pixel Blast"
              preview={`radial-gradient(circle at 30% 30%, ${appearance.brandColor}55, transparent 40%), radial-gradient(circle at 70% 70%, ${appearance.brandColor}88, #000 70%)`}
            />
            <BgOption
              active={appearance.background === "softAurora"}
              onClick={() =>
                setAppearance({ background: "softAurora" as BackgroundEffect })
              }
              label="Soft Aurora"
              preview={`linear-gradient(120deg, ${appearance.brandColor}, #f7f7f7 70%)`}
            />
            <BgOption
              active={appearance.background === "iridescence"}
              onClick={() =>
                setAppearance({ background: "iridescence" as BackgroundEffect })
              }
              label="Iridescence"
              preview={`conic-gradient(from 90deg at 50% 50%, #ff00ff, ${appearance.brandColor}, #00ffff, ${appearance.brandColor}, #ff00ff)`}
            />
          </div>

          {/* Glass cards */}
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
              Glass cards
            </span>
            <Switch
              checked={appearance.glassCards}
              onChange={(v) => setAppearance({ glassCards: v })}
            />
          </div>
          <p
            className="t-small"
            style={{
              marginTop: 4,
              color: "var(--text-muted)",
              fontSize: 11,
            }}
          >
            Translucent widget surfaces with backdrop blur. Pair with a
            background effect for the strongest visual.
          </p>

          {/* Brand color */}
          <SectionLabel style={{ marginTop: 16 }}>Brand color</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="color"
              value={appearance.brandColor}
              onChange={(e) => setAppearance({ brandColor: e.target.value })}
              style={{
                width: 36,
                height: 36,
                padding: 0,
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
              }}
            />
            <input
              type="text"
              value={appearance.brandColor}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
                  setAppearance({
                    brandColor: v.startsWith("#") ? v : `#${v}`,
                  });
                }
              }}
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "var(--bg-elev-2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 13,
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </div>
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

function BgOption({
  active,
  onClick,
  label,
  preview,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  preview: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 6,
        background: "var(--bg-elev-2)",
        border: `2px solid ${active ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          height: 38,
          borderRadius: 6,
          background: preview,
          border: "1px solid var(--border)",
        }}
      />
      <span
        style={{
          fontSize: 12,
          fontWeight: active ? 500 : 400,
          color: active ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        background: checked ? "var(--primary)" : "var(--bg-elev-3, var(--border))",
        borderRadius: 999,
        position: "relative",
        border: "none",
        cursor: "pointer",
        transition: "background 140ms",
        padding: 2,
      }}
    >
      <span
        style={{
          display: "block",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transform: `translateX(${checked ? 16 : 0}px)`,
          transition: "transform 140ms ease-out",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        }}
      />
    </button>
  );
}
