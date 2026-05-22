# Phase 3 — Chart Widgets + Dashboard Builder

Goal: ship the five widget types (gauge, bar, funnel, ranking, single value)
on a real drag-and-drop 12-column grid. The visuals are already drawn — this
phase makes them editable, resizable, and persistable.

> Design system reference: **[design-system.md](./design-system.md)**.
> Widgets are the canonical Card component (§10.3, radius `24px`,
> `--shadow-sm`, navy-tinted). KPI numbers use `.t-mono`; widget titles use
> `.t-h4`. The chart colors below are derivations from the named tokens —
> document any further derivation inline.
>
> Library choices: **[libraries.md](./libraries.md)**. Charts are standard
> library components, styled with our design system tokens:
> **Recharts** for BarChart, FunnelChart, and the SingleValue sparkline;
> **`react-gauge-component`** for the GaugeChart (semi-circle + needle +
> colored sub-arcs). The Ranking widget stays as DOM — it's a leaderboard,
> not a chart. `react-grid-layout` runs the 12-col canvas; `@dnd-kit`
> enters in Phase 4.

## Exit criteria

- [ ] All five widget components live in `components/widgets/` as pure
      React components with a single `result` + `config` prop.
- [ ] Widgets render exactly as in the prototype (verified pixel-by-pixel vs
      `screenshots/01-dashboard.png`, etc.).
- [ ] User can add a widget via "+ Add widget" → picker modal with chart
      thumbnails → chooses type → opens config panel.
- [ ] Right-side config panel binds the widget to a saved query (or opens the
      query builder inline).
- [ ] Drag-and-drop grid (react-grid-layout) — resize handles match
      design-system borders, drop ghost uses `--primary-soft`.
- [ ] Layout persisted to `dashboards.layout` JSON on debounced save.
- [ ] Number count-up animation works on value change (`useCountUp` from
      prototype).
- [ ] Ranking widget reorders smoothly via FLIP-style transform (the existing
      `--y` variable approach).

## Scope

### 3.1 Widget components (TSX ports)

| Widget        | Source in prototype             | Props                                          |
|---------------|---------------------------------|------------------------------------------------|
| GaugeChart    | `widgets.jsx` lines ~88–156     | `{ value, target, label, currency }`           |
| BarChart      | `widgets.jsx` lines ~161–208    | `{ data: {label,value,prev}[], max, currency }`|
| FunnelChart   | `widgets.jsx` lines ~213–245    | `{ stages: {label,value,formatted}[] }`        |
| RankingWidget | `widgets.jsx` lines ~250–292    | `{ reps: Rep[] }`                              |
| SingleValue   | `widgets.jsx` lines ~297–340    | `{ value, label, unit, delta, deltaPct, period, spark }` |
| WidgetShell   | `widgets.jsx` lines ~57–83      | `{ title, subtitle, source, updated, action }` |

All numbers use `.t-mono`. The `useCountUp` hook lives in
`src/hooks/useCountUp.ts`. Token-driven chart colors flow through
`src/lib/theme.ts` (a `useThemeTokens()` hook that reads CSS custom
properties off `<html>` and re-reads on `data-theme` mutations).

Implementation split:

- **GaugeChart** — `react-gauge-component` (`type="semicircle"`). Three
  sub-arcs drawn in `--danger-soft / --warning-soft / --success-soft` for
  the 0–50 / 50–80 / 80–100 ranges; the needle uses `--text-primary`. We
  hide the library's built-in value label and overlay our own typography so
  the gauge value renders in JetBrains Mono.
- **BarChart** — Recharts `BarChart` with two `Bar` series (previous as
  ghost in `--bg-elev-3`, current in `--primary` with a soft drop-shadow).
  `CartesianGrid` provides the dashed gridlines; `XAxis` / `YAxis` are
  axis-line-less with monospaced tick labels.
- **FunnelChart** — Recharts `FunnelChart` + `Funnel` + `LabelList`. The
  fill walks `--primary → --success` across stages via a hex `lerp`. A
  sibling tile strip below the chart shows stage-to-stage conversion %.
- **RankingWidget** — DOM (FLIP via `--y` CSS variable +
  `cubic-bezier(0.34, 1.2, 0.64, 1)` transform). No chart lib.
- **SingleValue** sparkline — Recharts `AreaChart` with a single `Area`
  series, `type="monotone"`, fill linked to a per-tile linear gradient
  keyed by the delta sign (success-green for up, danger-red for down).

### 3.2 Color derivation (documented)

Chart libraries take resolved color strings, not CSS variables. The
`useThemeTokens()` hook reads computed-style values off `<html>` and
re-reads on `data-theme` mutations so palette swaps still re-render the
charts.

| Chart usage         | Token / derivation                                         |
|---------------------|------------------------------------------------------------|
| Gauge band <50%     | `--danger-soft` arc + `--danger` readout text              |
| Gauge band 50–80%   | `--warning-soft` arc + `--warning` readout text            |
| Gauge band ≥80%     | `--success-soft` arc + `--success` readout text            |
| Gauge needle        | `--text-primary`                                           |
| Bar (current)       | `--primary` with `drop-shadow(0 0 6px rgba(2,65,227,.25))` |
| Bar (previous)      | `--bg-elev-3`                                              |
| Funnel stages       | Hex `lerp(--primary, --success)` across stages             |
| Ranking #1 medal    | `linear-gradient(135deg, --warning, #FF8A4C)` + amber glow |
| Ranking bars        | `linear-gradient(90deg, --primary, --primary-hover)`       |
| Sparkline +         | `--success` line + 0.3α → 0α area gradient                 |
| Sparkline −         | `--danger` line + 0.3α → 0α area gradient                  |

These are coded inline in the components, not added to `tokens.css`.

### 3.3 Dashboard grid (react-grid-layout)

- 12-col grid, 16px gutters, `rowHeight={56}`, breakpoints `lg / md / sm`.
- Drag handle: `.widget-drag` (already styled to fade in on `.widget:hover`).
- Resize handle: bottom-right corner, custom rendered to match border tokens.
- Drop target ghost: `1.5px dashed var(--border-strong)`, hover state =
  `var(--border-brand)` + `var(--primary-soft)` (mirrors `.widget-add`).
- Layout JSON shape:

```ts
type Layout = {
  widgets: Array<{
    id: string;
    type: 'gauge'|'bar'|'funnel'|'ranking'|'singleValue';
    queryId: string | null;            // null until configured
    config: WidgetDisplayConfig;       // per-type display options
    pos: { x: number; y: number; w: number; h: number };
  }>;
};
```

- Save: debounced 600ms after last move; explicit "Save" button in the top
  bar still fires immediate.

### 3.4 Widget picker modal

Triggered from "+ Add widget" or the dashed `.widget-add` placeholder. A
modal (existing `.card` class on a centered overlay) shows 5 thumbnails:

- Each thumbnail = the actual widget component fed with frozen demo data,
  scaled down via `transform: scale(.55)` + `pointer-events: none`.
- Hover = `border-color: var(--border-brand)`.
- Click → inserts a widget at the next free cell + opens the config panel.

### 3.5 Right-side config panel

A 360px-wide slide-out from the right (overlays canvas, scrolls
independently). Sections:

1. **Source** — segmented (Stripe / HubSpot / Mixed), echoes `<SourcePill/>`.
2. **Query** — picker dropdown listing saved queries filtered by source. Below
   it, a "+ New query" link opens the Phase 2 wizard inline.
3. **Display** — per-type fields:
   - Gauge: target value (numeric scrubber, JetBrains Mono input), currency.
   - Bar: grouped vs stacked toggle, show-previous toggle.
   - Funnel: stage order (drag rows), stage labels (text inputs).
   - Ranking: max rows (5–10), animate on change (toggle).
   - SingleValue: unit selector (€ / % / #), period label, show sparkline.
4. **Header** — title (text input), subtitle (text input), live-updates
   toggle.

Config panel writes through `useDashboardEditor` reducer; close = persists.

### 3.6 Number animation

Lifted directly from prototype (`useCountUp`): 900ms ease-out cubic on every
value change. Skeleton loader (the `widget-add` dashed border style) shown on
initial query fetch only.

## Tasks

1. Port widgets and shell to TSX with strict prop types (no `any`).
2. Add visual regression test (Playwright `toHaveScreenshot`) per widget.
3. Install + configure `react-grid-layout`; build the persisted layout
   round-trip with tRPC.
4. Build widget picker modal + thumbnails.
5. Build right config panel (`WidgetConfigPanel.tsx`) with the per-type
   sub-forms.
6. Wire query selection to `queries.list({ source })` from Phase 2.
7. Empty state for a brand-new dashboard: a single full-width `.widget-add`
   showing "Add your first widget".

## Out of scope (defer)

- Multi-dashboard cross-linking widgets.
- Conditional formatting beyond the gauge bands.
- CSV export per widget (note as Phase 5 nice-to-have).

## UAT criteria

- Drag a widget from row 1 to row 3 → grid reflows, save indicator fires
  600ms later; reload page → layout preserved.
- Resize a single-value widget from `col-3` to `col-6` → number reflows,
  sparkline scales.
- Add a new ranking widget bound to a HubSpot owner-grouped query → rows
  appear ordered, simulating shuffle by triggering a manual query refresh
  visibly reorders rows with the 700ms transform animation.
- Switch a gauge's target from 500K to 750K → arc fill animates from old %
  to new % over 600ms, number counts up to its new value.
- Pixel-diff the canonical "Q2 Revenue Pulse" layout in dark + light against
  `screenshots/01-dashboard.png` and `screenshots/04-dashboard.png` — diff
  under 1% per widget bounding box.
