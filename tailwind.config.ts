import type { Config } from "tailwindcss";

/**
 * Tailwind is a thin layer over our design system tokens. The serious styling
 * happens via the prototype's CSS in src/styles/* — Tailwind just gives us
 * utility classes for ad-hoc layout adjustments.
 *
 * Token names exposed here all alias to CSS custom properties so theme
 * switching (light / dark) updates Tailwind utilities automatically.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        canvas: "var(--bg-canvas)",
        elev1: "var(--bg-elev-1)",
        elev2: "var(--bg-elev-2)",
        elev3: "var(--bg-elev-3)",
        primary: "var(--primary)",
        "primary-hover": "var(--primary-hover)",
        "primary-soft": "var(--primary-soft)",
        secondary: "var(--secondary)",
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          muted: "var(--text-muted)",
        },
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "border-brand": "var(--border-brand)",
        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",
        info: "var(--info)",
        "info-soft": "var(--info-soft)",
        stripe: "var(--stripe)",
        hubspot: "var(--hubspot)",
      },
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
        pill: "var(--radius-pill)",
        button: "var(--radius-button)",
        card: "var(--radius-card)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
    },
  },
  // Tailwind's preflight is OK alongside the prototype CSS — the prototype's
  // own reset block matches it. Our `.t-h{1..4}` semantic classes win on
  // explicit application; we don't override Tailwind's heading defaults
  // because they don't conflict (we never apply Tailwind text utilities to
  // raw <h1>/<h2> elements).
  plugins: [],
};
export default config;
