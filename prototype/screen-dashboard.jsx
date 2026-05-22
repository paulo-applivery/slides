/* global React, Icons, WidgetShell, GaugeChart, BarChart, FunnelChart, RankingWidget, SingleValue, fmtEUR */
// =========================================================
// SEED DATA — realistic EU SaaS numbers
// =========================================================
const SEED = {
  workspace: 'Volta Software',
  dashboardName: 'Q2 Revenue Pulse',
  user: { name: 'Pau Aragó', initials: 'PA' },
  range: 'May 1 — May 20, 2026',
  // Gauge
  gauge: { value: 387_420, target: 500_000 },
  // Bars — weekly EUR new MRR
  bars: [
    { label: 'W1', value: 58_400, prev: 49_200 },
    { label: 'W2', value: 71_900, prev: 53_800 },
    { label: 'W3', value: 64_300, prev: 60_100 },
    { label: 'W4', value: 86_200, prev: 71_500 },
    { label: 'W5', value: 92_700, prev: 67_900 },
    { label: 'W6', value: 78_500, prev: 74_200 },
    { label: 'W7', value: 104_600, prev: 80_400 },
    { label: 'W8', value: 118_300, prev: 88_900 },
  ],
  // Funnel
  funnel: [
    { label: 'New leads',     value: 4128, formatted: '4,128' },
    { label: 'Qualified MQLs', value: 1842, formatted: '1,842' },
    { label: 'Open deals',     value: 612,  formatted: '612' },
    { label: 'Closed won',     value: 198,  formatted: '198' },
  ],
  // Ranking - sales reps
  reps: [
    { id: 'a', name: 'Anaïs Petit',      initials: 'AP', color: '#5C8BFF', value: 94_300,  target: 90_000,  delta: 2 },
    { id: 'b', name: 'Tomás Quintana',   initials: 'TQ', color: '#FBBF24', value: 87_500,  target: 90_000,  delta: -1 },
    { id: 'c', name: 'Lina Sørensen',    initials: 'LS', color: '#4ADE80', value: 76_200,  target: 90_000,  delta: 1 },
    { id: 'd', name: 'Mateusz Wojcik',   initials: 'MW', color: '#F87171', value: 64_900,  target: 90_000,  delta: 0 },
    { id: 'e', name: 'Greta Bianchi',    initials: 'GB', color: '#A855F7', value: 58_400,  target: 90_000,  delta: -2 },
  ],
  // KPIs
  mrr:        { value: 387_420, delta: 32_100, deltaPct: 9.0, spark: [320, 332, 341, 350, 358, 369, 371, 380, 387] },
  arr:        { value: 4_649_040, delta: 385_200, deltaPct: 9.0, spark: [3.9, 4.0, 4.1, 4.15, 4.22, 4.28, 4.35, 4.45, 4.65] },
  churn:      { value: 2.4, delta: -0.3, deltaPct: -11.1, spark: [3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5, 2.4] },
  newCust:    { value: 38, delta: 12, deltaPct: 46.2, spark: [16, 20, 22, 24, 21, 26, 32, 38] },
};
window.SEED = SEED;

// =========================================================
// DASHBOARD SCREEN
// =========================================================
const { useState, useEffect } = React;

const RangePill = ({ icon, children }) => (
  <span className="range-pill">
    {icon && <span className="range-pill-icon">{icon}</span>}
    {children}
  </span>
);

function Dashboard() {
  // Shuffle ranking every ~6s to demonstrate animated reorder
  const [reps, setReps] = useState(SEED.reps);
  useEffect(() => {
    const id = setInterval(() => {
      setReps((prev) => {
        const next = prev.map((r) => ({ ...r }));
        // Pick two distinct random reps, swap a small chunk of value
        const i = Math.floor(Math.random() * next.length);
        let j = Math.floor(Math.random() * next.length);
        if (j === i) j = (j + 1) % next.length;
        const delta = 1500 + Math.random() * 9000;
        next[i].value += delta;
        next[j].value -= delta * 0.6;
        return next;
      });
    }, 5500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="main">
      {/* Dashboard sub-header / meta row */}
      <div className="dash-meta">
        <div className="dash-meta-l">
          <RangePill icon={<Icons.Calendar size={14}/>}>{SEED.range}</RangePill>
          <RangePill>This month · Daily buckets</RangePill>
          <span className="badge badge-success"><span className="dot"/>Live</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm"><Icons.Refresh size={14}/> Refresh all</button>
          <button className="btn btn-sm"><Icons.Plus size={14}/> Add widget</button>
        </div>
      </div>

      {/* Top row — 4 KPI tiles (no source pill — saves header width) */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <div className="col-3">
          <WidgetShell title="MRR" subtitle="Monthly recurring revenue" updated="2m ago" footer={false} dragHandle={false}>
            <SingleValue value={SEED.mrr.value} label="mrr" unit="€" delta={SEED.mrr.delta} deltaPct={SEED.mrr.deltaPct} spark={SEED.mrr.spark} period="vs Apr 2026"/>
          </WidgetShell>
        </div>
        <div className="col-3">
          <WidgetShell title="ARR" subtitle="Annual run rate" updated="2m ago" footer={false} dragHandle={false}>
            <SingleValue value={SEED.arr.value} label="arr" unit="€" delta={SEED.arr.delta} deltaPct={SEED.arr.deltaPct} spark={SEED.arr.spark} period="vs Apr 2026"/>
          </WidgetShell>
        </div>
        <div className="col-3">
          <WidgetShell title="Net Churn" subtitle="Revenue lost / total" updated="2m ago" footer={false} dragHandle={false}>
            <SingleValue value={SEED.churn.value} label="churn" unit="%" delta={SEED.churn.delta} deltaPct={SEED.churn.deltaPct} spark={SEED.churn.spark} period="vs last month"/>
          </WidgetShell>
        </div>
        <div className="col-3">
          <WidgetShell title="New customers" subtitle="Closed-won this month" updated="4m ago" footer={false} dragHandle={false}>
            <SingleValue value={SEED.newCust.value} label="cust" unit="#" delta={SEED.newCust.delta} deltaPct={SEED.newCust.deltaPct} spark={SEED.newCust.spark} period="vs last month"/>
          </WidgetShell>
        </div>
      </div>

      {/* Main row — gauge + bars */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <div className="col-5">
          <WidgetShell title="Q2 Revenue Target" subtitle="May progress toward €500K goal" source="mixed" updated="1m ago">
            <GaugeChart value={SEED.gauge.value} target={SEED.gauge.target}/>
          </WidgetShell>
        </div>
        <div className="col-7">
          <WidgetShell title="New MRR by Week" subtitle="Stripe charges (recurring) · last 8 weeks" source="stripe" updated="2m ago">
            <BarChart data={SEED.bars}/>
          </WidgetShell>
        </div>
      </div>

      {/* Bottom row — funnel + ranking */}
      <div className="dash-grid">
        <div className="col-7">
          <WidgetShell title="Pipeline Funnel" subtitle="HubSpot deals · May 2026" source="hubspot" updated="3m ago">
            <FunnelChart stages={SEED.funnel}/>
          </WidgetShell>
        </div>
        <div className="col-5">
          <WidgetShell
            title="Sales Team Ranking"
            subtitle="Closed-won revenue · live"
            source="hubspot"
            updated="just now"
            action={<span className="badge badge-brand"><span className="dot"/>Auto-ranking</span>}
          >
            <RankingWidget reps={reps}/>
          </WidgetShell>
        </div>
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
