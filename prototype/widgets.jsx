/* global React, Icons */
// =========================================================
// APEX widget library
// Each widget is wrapped in WidgetShell (header + body).
// Charts use plain SVG (no Recharts) so we control every pixel.
// =========================================================

const { useEffect, useRef, useState, useMemo } = React;

// ------- shared helpers -------
const fmtEUR = (n) => {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return '€' + (n / 1_000).toFixed(1) + 'K';
  return '€' + Math.round(n);
};
const fmtInt = (n) => n.toLocaleString('en-US');
const fmtPct = (n, digits = 0) => (n >= 0 ? '+' : '') + n.toFixed(digits) + '%';

// Animated number that counts up on mount and on value change
function useCountUp(value, duration = 900) {
  const [display, setDisplay] = useState(value);
  const ref = useRef({ from: value, to: value, start: 0, raf: null });
  useEffect(() => {
    ref.current.from = display;
    ref.current.to = value;
    ref.current.start = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - ref.current.start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = ref.current.from + (ref.current.to - ref.current.from) * eased;
      setDisplay(v);
      if (k < 1) ref.current.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(ref.current.raf);
    ref.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current.raf);
  }, [value]);
  return display;
}

// ------- Source pill (Stripe / HubSpot) -------
const SourcePill = ({ source }) => {
  const map = {
    stripe: { label: 'Stripe', color: '#635BFF' },
    hubspot: { label: 'HubSpot', color: '#FF7A59' },
    mixed: { label: 'Stripe + HubSpot', color: 'var(--text-tertiary)' },
  };
  const s = map[source] || map.stripe;
  return (
    <span className="src-pill" style={{ color: s.color }}>
      <span className="src-dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
};

// ------- Widget shell -------
const WidgetShell = ({ title, subtitle, source, updated = 'now', children, footer, dragHandle = true, action }) => (
  <div className="widget">
    <header className="widget-head">
      <div className="widget-head-l">
        {dragHandle && <span className="widget-drag" title="Drag"><Icons.Drag size={14}/></span>}
        <div>
          <div className="widget-title">{title}</div>
          {subtitle && <div className="widget-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="widget-head-r">
        {source && <SourcePill source={source}/>}
        {action || <button className="widget-iconbtn" title="More"><Icons.More size={14}/></button>}
      </div>
    </header>
    <div className="widget-body">{children}</div>
    {footer !== false && (
      <footer className="widget-foot">
        <span className="widget-foot-time">
          <span className="widget-foot-dot"/> Live · updated {updated}
        </span>
        <button className="widget-iconbtn" title="Refresh"><Icons.Refresh size={13}/></button>
      </footer>
    )}
  </div>
);

// =========================================================
// 1. GAUGE — semicircular arc with needle
// =========================================================
const GaugeChart = ({ value, target, label = 'Revenue', currency = '€' }) => {
  const animated = useCountUp(value);
  const pct = Math.min(1.2, value / target);
  const animPct = Math.min(1.2, animated / target);

  // Color band by % of target
  const bandColor = pct >= 0.8 ? 'var(--success)' : pct >= 0.5 ? 'var(--warning)' : 'var(--danger)';

  // SVG geometry: semicircular arc, 180° span
  const W = 380, H = 200, cx = W / 2, cy = 175, r = 130, stroke = 22;
  const arcPath = (start, end) => {
    const a0 = Math.PI + start * Math.PI;
    const a1 = Math.PI + end * Math.PI;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = end - start > 0.5 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };

  // Needle angle (clamped 0..1.05 for slight overshoot allowance)
  const needleK = Math.min(1.05, animPct);
  const needleA = Math.PI + needleK * Math.PI;
  const nx = cx + (r - stroke - 8) * Math.cos(needleA);
  const ny = cy + (r - stroke - 8) * Math.sin(needleA);

  // Tick marks at 0/25/50/75/100
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* track */}
        <path d={arcPath(0, 1)} stroke="var(--bg-elev-3)" strokeWidth={stroke} fill="none" strokeLinecap="round"/>
        {/* color bands (subtle, behind active fill) */}
        <path d={arcPath(0, 0.5)} stroke="var(--danger-soft)" strokeWidth={stroke} fill="none" strokeLinecap="round" opacity="0.6"/>
        <path d={arcPath(0.5, 0.8)} stroke="var(--warning-soft)" strokeWidth={stroke} fill="none" strokeLinecap="round" opacity="0.6"/>
        <path d={arcPath(0.8, 1)} stroke="var(--success-soft)" strokeWidth={stroke} fill="none" strokeLinecap="round" opacity="0.6"/>
        {/* active fill */}
        <path d={arcPath(0, Math.min(1, animPct))} stroke={bandColor} strokeWidth={stroke} fill="none" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 12px ' + bandColor + ')'}}/>
        {/* ticks */}
        {ticks.map((t) => {
          const a = Math.PI + t * Math.PI;
          const r1 = r + stroke / 2 + 4;
          const r2 = r1 + 6;
          return (
            <line key={t}
              x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)}
              stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
          );
        })}
        {/* needle */}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="9" fill="var(--bg-elev-1)" stroke="var(--text-primary)" strokeWidth="2"/>
        {/* end labels */}
        <text x={cx - r} y={cy + 24} className="gauge-tick">{currency}0</text>
        <text x={cx + r} y={cy + 24} textAnchor="end" className="gauge-tick">{fmtEUR(target)}</text>
      </svg>
      <div className="gauge-readout">
        <div className="gauge-value t-mono">{fmtEUR(animated)}</div>
        <div className="gauge-meta">
          <span className="gauge-pct" style={{ color: bandColor }}>{Math.round(animPct * 100)}% of target</span>
          <span className="gauge-target">target {fmtEUR(target)}</span>
        </div>
      </div>
    </div>
  );
};

// =========================================================
// 2. BAR CHART — grouped bars over time
// =========================================================
const BarChart = ({ data, max, currency = '€' }) => {
  // data: [{label, value, prev}]
  const W = 600, H = 220, padX = 28, padY = 24;
  const innerW = W - padX * 2, innerH = H - padY * 2 - 28;
  const m = max || Math.max(...data.flatMap(d => [d.value, d.prev || 0])) * 1.1;
  const bw = innerW / data.length;
  const barW = Math.min(28, bw * 0.35);

  return (
    <div className="bars-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none">
        {/* horizontal gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(g => {
          const y = padY + innerH * (1 - g);
          return <line key={g} x1={padX} x2={W - padX} y1={y} y2={y} stroke="var(--border)" strokeDasharray={g === 0 ? '' : '2 4'}/>;
        })}
        {/* y axis labels */}
        {[0, 0.5, 1].map(g => {
          const y = padY + innerH * (1 - g);
          return <text key={g} x={6} y={y + 4} className="chart-axis">{fmtEUR(m * g).replace('€','')}</text>;
        })}
        {/* bars */}
        {data.map((d, i) => {
          const x = padX + i * bw + bw / 2;
          const h1 = innerH * (d.value / m);
          const h0 = innerH * ((d.prev || 0) / m);
          return (
            <g key={i}>
              {/* prev (ghost) */}
              {d.prev != null && (
                <rect x={x - barW - 2} y={padY + innerH - h0} width={barW} height={h0}
                  fill="var(--bg-elev-3)" rx="3"/>
              )}
              {/* current */}
              <rect x={x + 2} y={padY + innerH - h1} width={barW} height={h1}
                fill="var(--primary)" rx="3" style={{ filter: 'drop-shadow(0 0 6px rgba(92,139,255,.35))' }}/>
              <text x={x} y={H - 6} textAnchor="middle" className="chart-axis">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        <span><span className="lg-sw" style={{ background: 'var(--bg-elev-3)' }}/>Previous</span>
        <span><span className="lg-sw" style={{ background: 'var(--primary)' }}/>This period</span>
      </div>
    </div>
  );
};

// =========================================================
// 3. FUNNEL — horizontal stages with conversion arrows
// =========================================================
const FunnelChart = ({ stages }) => {
  // stages: [{label, value, formatted}]
  const max = stages[0].value;
  return (
    <div className="funnel">
      {stages.map((s, i) => {
        const ratio = s.value / max;
        const conv = i > 0 ? (s.value / stages[i - 1].value) * 100 : null;
        return (
          <React.Fragment key={s.label}>
            <div className="funnel-row">
              <div className="funnel-label">
                <span className="t-micro">{`Stage ${i + 1}`}</span>
                <span className="funnel-name">{s.label}</span>
              </div>
              <div className="funnel-bar-wrap">
                <div className="funnel-bar" style={{ width: `${ratio * 100}%`, background: `linear-gradient(90deg, var(--primary), ${i === stages.length - 1 ? 'var(--success)' : 'var(--primary-hover)'})` }}>
                  <span className="funnel-bar-value t-mono">{s.formatted || fmtInt(s.value)}</span>
                </div>
              </div>
            </div>
            {conv != null && (
              <div className="funnel-arrow">
                <span className="funnel-arrow-line"/>
                <span className="funnel-conv t-mono">{conv.toFixed(1)}% →</span>
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// =========================================================
// 4. RANKING — animated leaderboard, FLIP-style reorder
// =========================================================
const RankingWidget = ({ reps }) => {
  const sorted = [...reps].sort((a, b) => b.value - a.value);
  // We render via CSS variable `--y` to slide rows; entries are keyed by id so React preserves them.
  const positions = sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  return (
    <div className="rank-list">
      {positions.map((r) => {
        const pctOfTop = r.value / positions[0].value;
        const pctOfTarget = r.value / r.target;
        const isTop = r.rank === 1;
        return (
          <div key={r.id}
            className="rank-row"
            style={{ '--y': `${(r.rank - 1) * 56}px`, zIndex: 100 - r.rank }}
          >
            <div className={`rank-num ${isTop ? 'rank-top' : ''}`}>
              <span className="t-mono">{r.rank}</span>
            </div>
            <div className="rank-avatar" style={{ background: r.color }}>
              {r.initials}
            </div>
            <div className="rank-main">
              <div className="rank-name-row">
                <span className="rank-name">{r.name}</span>
                <span className="rank-value t-mono">{fmtEUR(r.value)}</span>
              </div>
              <div className="rank-bar-track">
                <div className="rank-bar" style={{ width: `${Math.min(100, pctOfTarget * 100)}%` }}/>
                <div className="rank-bar-target" style={{ left: '100%' }} title="100% target"/>
              </div>
              <div className="rank-meta">
                <span>{Math.round(pctOfTarget * 100)}% of {fmtEUR(r.target)} target</span>
                <span className={`rank-delta ${r.delta >= 0 ? 'up' : 'down'}`}>
                  {r.delta >= 0 ? '↑' : '↓'} {Math.abs(r.delta)} this week
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// =========================================================
// 5. SINGLE VALUE — big number + sparkline
// =========================================================
const SingleValue = ({ value, label, unit = '€', delta, deltaPct, period = 'vs last month', spark }) => {
  const animated = useCountUp(value);
  const positive = (deltaPct ?? 0) >= 0;
  // Sparkline path
  const sparkPath = useMemo(() => {
    if (!spark || spark.length < 2) return '';
    const W = 120, H = 36;
    const min = Math.min(...spark), max = Math.max(...spark);
    const rng = max - min || 1;
    return spark.map((v, i) => {
      const x = (i / (spark.length - 1)) * W;
      const y = H - ((v - min) / rng) * H;
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ');
  }, [spark]);

  const display = unit === '€' ? fmtEUR(animated) : unit === '%' ? animated.toFixed(1) + '%' : fmtInt(Math.round(animated));

  return (
    <div className="sv">
      <div className="sv-top">
        <div className="sv-value t-mono">{display}</div>
        <svg viewBox="0 0 120 36" width="120" height="36" className="sv-spark">
          <defs>
            <linearGradient id={`sg-${label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={positive ? 'var(--success)' : 'var(--danger)'} stopOpacity="0.3"/>
              <stop offset="1" stopColor={positive ? 'var(--success)' : 'var(--danger)'} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={sparkPath + ' L 120 36 L 0 36 Z'} fill={`url(#sg-${label})`}/>
          <path d={sparkPath} stroke={positive ? 'var(--success)' : 'var(--danger)'} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="sv-bottom">
        <span className={`sv-delta ${positive ? 'up' : 'down'}`}>
          <span className="sv-delta-arrow">{positive ? '▲' : '▼'}</span>
          <span className="sv-delta-pct">{Math.abs(deltaPct).toFixed(1)}%</span>
          <span className="sv-delta-abs">{positive ? '+' : ''}{unit === '€' ? fmtEUR(delta) : delta}</span>
        </span>
        <span className="sv-period">{period}</span>
      </div>
    </div>
  );
};

window.WidgetShell = WidgetShell;
window.GaugeChart = GaugeChart;
window.BarChart = BarChart;
window.FunnelChart = FunnelChart;
window.RankingWidget = RankingWidget;
window.SingleValue = SingleValue;
window.fmtEUR = fmtEUR;
window.fmtInt = fmtInt;
window.fmtPct = fmtPct;
window.useCountUp = useCountUp;
