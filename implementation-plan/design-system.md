# Applivery Design System

A brand-aligned design system for **Applivery** — a Unified Endpoint Management (UEM) platform that helps IT teams manage devices and distribute apps across Android, iOS, macOS, and Windows.

> **Light mode is canonical.** All tokens below describe the default light theme. A dark adaptation exists (see `Smart Attributes.html` in the source kit) but every brand decision originates from the light palette.

---

## 1. Brand Identity

### 1.1 Voice & tone
Technical, calm, direct. Written for **IT administrators**, not consumers.

| Aspect | Rule |
|---|---|
| Person | Impersonal / third-person ("Administrators can…", "Devices are…"). Second-person only for procedural steps. |
| Casing | Title Case for product nouns (`Devices`, `Smart Attributes`, `Device Audiences`, `Policies`, `Workspace`). UI labels in **bold**. |
| Structure | Short opening definition, then expansion. Em-dashes for asides. TL;DR boxes, numbered steps, comparison tables. |
| Punctuation | No exclamation marks. No contractions in headings. |
| Emoji | **Never.** Unicode arrows (→, ↓) and checkmarks (✓) only, sparingly. |
| Forbidden | Marketing fluff, hype words, "supercharge", "unleash", "delight". |

### 1.2 Hard brand rules
- **Font:** Outfit — never bold. Cap UI weight at **600**.
- **Primary:** `#0241e3` · **Secondary (ink):** `#010258` · **Canvas:** `#F1F6FF`
- **Radii:** Cards `24px`, buttons & inputs `10px`, badges & segmented controls `pill`.
- **Icons:** Solar — **Outline** (1.5px stroke) for dashboard/admin, **Duotone** for marketing/web. Bold variant only for the active state.
- **Backgrounds:** Pure white is off-brand. Default page background is the soft canvas tint.
- **Gradients:** Avoid, except as faint ambient glows.

---

## 2. Color

### 2.1 Primary (brand blue)
Crisp, optimistic blue. Base `#0241E3` = `--primary-600`.

| Token | Hex | Usage |
|---|---|---|
| `--primary-50`  | `#EEF4FF` | Faintest tint, hover backgrounds |
| `--primary-100` | `#DBE7FF` | Info-soft surfaces |
| `--primary-200` | `#B8CFFF` | Disabled brand fills |
| `--primary-300` | `#8AAEFF` | Decorative |
| `--primary-400` | `#5C8BFF` | **Use on dark surfaces** |
| `--primary-500` | `#2D67F2` | Mid scale |
| `--primary-600` | `#0241E3` | **Base · use on light surfaces** |
| `--primary-700` | `#0137C4` | Hover (`--primary-hover`) |
| `--primary-800` | `#012AA3` | Press (`--primary-press`) |
| `--primary-900` | `#010258` | = secondary |

Aliases: `--primary` = 600, `--primary-soft` = `rgba(2,65,227,0.10)`, `--primary-tint` = `rgba(2,65,227,0.05)`.

### 2.2 Secondary / Navy ink scale
Deep navy carries the brand into typography, borders, and dark surfaces.

| Token | Hex | Usage |
|---|---|---|
| `--navy-50`  | `#F1F6FF` | = canvas |
| `--navy-100` | `#E2E8F4` | = `--border` (1px hairlines) |
| `--navy-200` | `#C9D3E8` | = `--border-strong` |
| `--navy-300` | `#A8B5D3` | Muted icon fills |
| `--navy-400` | `#8A98BA` | = `--text-muted` |
| `--navy-500` | `#5A6A95` | = `--text-tertiary` |
| `--navy-600` | `#2A3866` | = `--text-secondary` |
| `--navy-700` | `#1A2552` | Dark surface ink |
| `--navy-800` | `#0B1638` | Deepest neutral |
| `--navy-900` | `#010258` | **Base ink, = `--secondary`** |

Alias: `--secondary-soft` = `rgba(1,2,88,0.08)`.

### 2.3 Accent
Mathematical tints/shades of the primary, for layered emphasis.

| Token | Hex | Notes |
|---|---|---|
| `--accent-50`  | `#E5ECFC` |  |
| `--accent-100` | `#CCDAFA` |  |
| `--accent-200` | `#99B5F6` |  |
| `--accent-300` | `#6691F1` | **Dark-mode default** (`--accent-light`) |
| `--accent-400` | `#336CED` |  |
| `--accent-500` | `#0241E3` | = brand primary |
| `--accent-600` | `#0237C2` | **Light-mode default** (`--accent`) |
| `--accent-700` | `#022D9F` |  |
| `--accent-800` | `#02227C` |  |
| `--accent-900` | `#011759` |  |

### 2.4 Surface & text
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#FFFFFF` | Cards, popovers |
| `--bg-canvas` | `#F1F6FF` | **Default page background** |
| `--bg-elev-1` | `#FFFFFF` | Resting card |
| `--bg-elev-2` | `#F6F9FF` | Hover / secondary surface |
| `--bg-elev-3` | `#ECF1FB` | Pressed / tertiary |
| `--canvas` | `#F1F6FF` | Alias of `--bg-canvas` |
| `--text-primary` | `#010258` | Body & headings (navy, not black) |
| `--text-secondary` | `#2A3866` | Supporting copy |
| `--text-tertiary` | `#5A6A95` | Captions, helper text |
| `--text-muted` | `#8A98BA` | Placeholders, disabled |
| `--border` | `#E2E8F4` | 1px hairlines |
| `--border-strong` | `#C9D3E8` | Emphasized dividers |
| `--border-brand` | `rgba(2,65,227,0.32)` | Brand-tinted card borders |

### 2.5 Semantic
| State | Solid | Soft |
|---|---|---|
| Success | `#16A34A` (`--success`) | `#DCFCE7` (`--success-soft`) |
| Warning | `#D97706` (`--warning`) | `#FEF3C7` (`--warning-soft`) |
| Danger | `#DC2626` (`--danger`) | `#FEE2E2` (`--danger-soft`) |
| Info | `#0241E3` (`--info`) | `#DBE7FF` (`--info-soft`) |

---

## 3. Typography

### 3.1 Families
- **Sans (UI + body):** `Outfit`, system-ui, -apple-system, sans-serif → `--font-sans`
- **Mono (code):** `JetBrains Mono`, ui-monospace, SFMono-Regular, monospace → `--font-mono`

### 3.2 Weight system
**Brand rule: never use 700+ in UI.** Outfit's geometric forms hold their hierarchy through size and tracking, not weight.

| Token | Value | When |
|---|---|---|
| `--fw-light` | `300` | Avoid in UI; editorial only |
| `--fw-regular` | `400` | Body, paragraphs |
| `--fw-medium` | `500` | Headings, display, buttons |
| `--fw-semibold` | `600` | Emphasis, active nav |

### 3.3 Scale
| Token | Size | Line-height | Tracking | Role |
|---|---|---|---|---|
| `--fs-display` | `56px` | `1.15` | `-0.025em` | Hero / marquee |
| `--fs-h1` | `40px` | `1.15` | `-0.02em` | Page title |
| `--fs-h2` | `28px` | `1.35` | `-0.01em` | Section |
| `--fs-h3` | `20px` | `1.35` | — | Subsection |
| `--fs-h4` | `17px` | `1.35` | — | Card title |
| `--fs-body` | `15px` | `1.55` | — | Paragraph |
| `--fs-small` | `13px` | `1.55` | — | Helper, captions |
| `--fs-micro` | `11px` | `1.2` | `0.08em` uppercase | Eyebrows, labels |

Line-height tokens: `--lh-tight 1.15`, `--lh-snug 1.35`, `--lh-normal 1.55`, `--lh-relaxed 1.7`.

### 3.4 Semantic role classes

```css
.t-display { font: 500 56px/1.15 Outfit; letter-spacing: -0.025em; color: var(--text-primary); }
.t-h1      { font: 500 40px/1.15 Outfit; letter-spacing: -0.02em;  color: var(--text-primary); }
.t-h2      { font: 500 28px/1.35 Outfit; letter-spacing: -0.01em;  color: var(--text-primary); }
.t-h3      { font: 500 20px/1.35 Outfit;                            color: var(--text-primary); }
.t-h4      { font: 500 17px/1.35 Outfit;                            color: var(--text-primary); }
.t-body    { font: 400 15px/1.55 Outfit;                            color: var(--text-secondary); }
.t-small   { font: 400 13px/1.55 Outfit;                            color: var(--text-tertiary); }
.t-micro   { font: 500 11px/1.2  Outfit; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
.t-mono    { font: 400 13px/1.55 'JetBrains Mono'; }
```



---

## 4. Spacing

4-pt base scale. Use multiples of 4; pair `gap` with flex/grid over per-element margins.

| Token | Value | Common use |
|---|---|---|
| `--space-1` | `4px` | Icon ↔ label, hairline padding |
| `--space-2` | `8px` | Chip, badge padding |
| `--space-3` | `12px` | Input internal padding |
| `--space-4` | `16px` | **Default gap**, card padding |
| `--space-5` | `20px` | Compact card |
| `--space-6` | `24px` | Card padding, section gap |
| `--space-8` | `32px` | Section padding |
| `--space-10` | `40px` | Page gutter |
| `--space-12` | `48px` | Large section |
| `--space-16` | `64px` | Hero |

### Layout grid
- Content max-width **~880px** for docs/long-form.
- Fixed sidebar **280px**, fixed TOC **240px**.
- Gutters **16px** → scale to 24/32 on larger sections.
- Generous whitespace by default.

---

## 5. Radii

Rule of thumb: **radius ≈ height ÷ 4**. The 24 / 10 split (card vs. button) is the most recognizable shape signature.

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | `4px` | Chips, dots, indicators |
| `--radius-sm` | `6px` | 28px controls, small badges |
| `--radius-md` | `10px` | **Default button & input** (40px controls) |
| `--radius-lg` | `14px` | 52px controls, compact cards, alerts |
| `--radius-xl` | `18px` | Medium cards |
| `--radius-2xl` | `24px` | **Default card** (large) |
| `--radius-3xl` | `32px` | Hero, modals |
| `--radius-pill` | `9999px` | Badges, segmented controls, avatars |

Semantic aliases: `--radius-card` = `2xl`, `--radius-button` = `--radius-input` = `md`.

---

## 6. Shadows

Soft, **navy-tinted** — never gray. Used for elevation, not decoration.

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(1, 2, 88, 0.06)` | Resting card lift |
| `--shadow-md` | `0 4px 12px rgba(1, 2, 88, 0.08)` | Hover, dropdown |
| `--shadow-lg` | `0 16px 40px rgba(1, 2, 88, 0.12)` | Modal, popover |
| `--shadow-glow` | `0 0 0 4px rgba(2, 65, 227, 0.18)` | **Focus ring (always)** |

---

## 7. Motion

- **Duration:** 120–200ms for most state changes.
- **Easing:** `ease-out`. No bounces, no overshoots.
- **Hover:** subtle background shift or border-darken.
- **Press:** darker brand tint; never shrink/scale.
- **Focus:** always a 4px brand-blue glow ring (`--shadow-glow`) on interactive elements.

---

## 8. Iconography

[Solar Icons](https://solar-icons.com/) — 24×24 viewBox, inline SVG, `currentColor`-driven.

| Context | Variant | Stroke |
|---|---|---|
| Dashboard / admin console | **Solar Outline** | 1.5px |
| Active / selected state | Solar Bold | — |
| Marketing / web | **Solar Duotone** | — |

- **Never emoji.**
- Unicode used sparingly: `→ ↓ ✓ —` in tables and breadcrumbs.

---

## 9. Imagery

- Product screenshots wrapped in soft **brand-tinted frames**:
  - Frame bg: `#0062ff17`
  - Outer radius: `22px`
  - Inner radius (image): `16px`
- Clean, well-lit UI captures. **No grain, no desaturation, no overlays.**

---

## 10. Components

### 10.1 Button

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--primary` | `#FFFFFF` | none |
| Primary · hover | `--primary-hover` (`#0137C4`) | `#FFFFFF` | none |
| Primary · pressed | `--primary-press` (`#012AA3`) | `#FFFFFF` | none |
| Secondary | `#FFFFFF` | `--text-primary` | `1px var(--border-strong)` |
| Ghost | transparent | `--primary` | none |
| Danger | `--danger` | `#FFFFFF` | none |

**Spec:** height `40px`, padding `10px 16px`, radius `10px`, font `500 15px Outfit`, transition `120ms ease-out`. Focus = `--shadow-glow`.

### 10.2 Input / select / textarea
- Height `40px`, padding `10px 12px`, radius `10px`, border `1px var(--border)`, background `--bg`.
- Placeholder: `--text-muted`.
- Focus: border `--primary`, shadow `--shadow-glow`.
- Error: border `--danger`, helper text `--danger`.
- Label: `.t-micro` above field, `8px` gap.

### 10.3 Card
- Background `--bg`, border `1px var(--border)`, radius `24px` (`--radius-card`), padding `24px`, shadow `--shadow-sm`.
- Emphasized variant: border `--border-brand`, shadow `--shadow-md`.
- Hover (interactive cards): shadow `--shadow-md`, border `--border-strong`. No translate / scale.

### 10.4 Badge
- Pill (`--radius-pill`), padding `2px 10px`, font `500 11px Outfit`, uppercase, letter-spacing `0.06em`.
- Color pairings use the `*-soft` background with the solid as text, e.g. success = `bg: --success-soft / text: --success`.

### 10.5 Callout
- Radius `14px` (`--radius-lg`), padding `16px 20px`, 4px left accent bar in semantic solid, background in semantic soft.
- Icon `20px` semantic solid, gap `12px`, body `--text-secondary`.

### 10.6 Segmented control
- Pill container, `--bg-elev-2` background, `4px` inner padding.
- Active segment: `--bg`, `--shadow-sm`, text `--text-primary`.
- Inactive segment: text `--text-tertiary`. 120ms cross-fade.

### 10.7 Table
- Header: `.t-micro`, `--text-tertiary`, `--bg-elev-2` background, `12px 16px` padding.
- Row: `1px solid --border` divider, `14px 16px` padding, text `--fs-body / --text-primary`.
- Hover row: `--bg-elev-2`.

### 10.8 Nav / sidebar
- Fixed width `280px`, background `--bg`, right border `1px --border`.
- Item: `40px` height, radius `10px`, padding `0 12px`, gap `10px` (icon ↔ label).
- Active: background `--primary-soft`, text + icon `--primary`, icon = Solar **Bold**.
- Inactive icon = Solar **Outline**, color `--text-tertiary`.

---

## 11. Assets

| Asset | Path | Notes |
|---|---|---|
| Wordmark (color) | `assets/applivery-logo.svg` | Primary brand mark |
| Wordmark (white) | `assets/applivery-logo-white.svg` | For dark/brand surfaces |
| Favicon | `assets/favicon_blue.svg` | Browser tab |

**Fonts** ship as local `.ttf` in `fonts/` (Outfit 100–900). Always self-host; do not pull from Google CDN.

---

## 12. Token Index (CSS custom properties)

All 103 tokens defined in `colors_and_type.css`:

**Color · primary** `--primary` · `--primary-hover` · `--primary-press` · `--primary-soft` · `--primary-tint` · `--primary-50…900`
**Color · secondary / navy** `--secondary` · `--secondary-soft` · `--navy-50…900`
**Color · accent** `--accent` · `--accent-light` · `--accent-50…900`
**Color · surface** `--bg` · `--bg-canvas` · `--bg-elev-1/2/3` · `--canvas`
**Color · text** `--text-primary` · `--text-secondary` · `--text-tertiary` · `--text-muted`
**Color · border** `--border` · `--border-strong` · `--border-brand`
**Color · semantic** `--success(/-soft)` · `--warning(/-soft)` · `--danger(/-soft)` · `--info(/-soft)`
**Radii** `--radius-xs/sm/md/lg/xl/2xl/3xl/pill` + `--radius-card` · `--radius-button` · `--radius-input`
**Shadow** `--shadow-sm/md/lg/glow`
**Spacing** `--space-1/2/3/4/5/6/8/10/12/16`
**Typography** `--font-sans` · `--font-mono` · `--fs-display/h1/h2/h3/h4/body/small/micro` · `--lh-tight/snug/normal/relaxed` · `--fw-light/regular/medium/semibold`

---

## 13. Quick reference


```
PRIMARY     #0241E3       CANVAS       #F1F6FF       INK        #010258
HOVER       #0137C4       SURFACE      #FFFFFF       MUTED      #8A98BA
PRESS       #012AA3       BORDER       #E2E8F4       FOCUS      rgba(2,65,227,.18) · 4px

CARD r=24   BUTTON r=10   INPUT r=10   PILL r=9999
FONT Outfit · 400/500/600 (never ≥700)
GAP 16 default · CONTENT 880 · SIDEBAR 280 · TOC 240
SHADOW navy-tinted (rgba(1,2,88,.06–.12))
ICONS Solar Outline 1.5px (admin) · Solar Duotone (marketing)
```
