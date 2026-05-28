/* global React, Icons, SEED, GaugeChart, BarChart, FunnelChart, RankingWidget, SingleValue, fmtEUR */
// =========================================================
// TV MODE
// Two states:
//   - unpaired: QR + 6-digit PIN, "Scan to activate"
//   - paired: full-bleed auto-rotating slideshow with crossfade
// =========================================================

const { useState: useStateT, useEffect: useEffectT, useRef: useRefT } = React;

// ---------- QR placeholder (deterministic random matrix) ----------
function QRCode({ size = 220 }) {
  // Pseudo-random 25x25 modules - looks like a real QR (we're not actually encoding)
  const N = 25;
  const cells = React.useMemo(() => {
    const arr = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // finder boxes corners
        const corner = (x < 7 && y < 7) || (x > N - 8 && y < 7) || (x < 7 && y > N - 8);
        if (corner) {
          // 3 nested squares
          const inX = corner && ((x === 0 || x === 6 || y === 0 || y === 6) ||
                                  (x === 1 || x === 5 || y === 1 || y === 5) === false &&
                                  (x >= 2 && x <= 4 && y >= 2 && y <= 4));
          // simpler logic: draw all-black perimeter (0/6) + inner box (2-4)
          const perim = (x === 0 || x === 6 || y === 0 || y === 6) ||
                        (x === (corner && x > N - 8 ? N - 7 : 0)) ||
                        (y === (corner && y > N - 8 ? N - 7 : 0));
          // Need to compute relative coords
          let rx = x, ry = y;
          if (x > N - 8) rx = x - (N - 7);
          if (y > N - 8) ry = y - (N - 7);
          const isPerim = (rx === 0 || rx === 6 || ry === 0 || ry === 6);
          const isInner = (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4);
          arr.push({ x, y, on: isPerim || isInner });
        } else {
          arr.push({ x, y, on: rnd() > 0.5 });
        }
      }
    }
    return arr;
  }, []);

  const cell = size / N;
  return (
    <svg viewBox={`0 0 ${N} ${N}`} width={size} height={size} className="qr">
      <rect x="0" y="0" width={N} height={N} fill="#fff" rx="0.5"/>
      {cells.filter(c => c.on).map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width="1" height="1" fill="#050B1F"/>
      ))}
    </svg>
  );
}

// ---------- Unpaired (QR) state ----------
function TVUnpaired({ onPair }) {
  const [pin] = useStateT('428 901');
  const [secondsLeft, setSecondsLeft] = useStateT(297);
  useEffectT(() => {
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.floor(secondsLeft / 60), secs = secondsLeft % 60;

  return (
    <div className="tv-unpaired">
      <div className="tv-glow"/>
      <div className="tv-up-grid">
        <div className="tv-up-left">
          <div className="tv-up-brand">
            <span className="tv-up-mark"/>
            <span>Applivery Atlas</span>
          </div>
          <h1 className="tv-up-h1">Pair this screen</h1>
          <p className="tv-up-sub">Scan the QR code with your phone — or enter the PIN at <span className="t-mono">app.applivery.com/pair</span> on any signed-in device.</p>
          <ol className="tv-up-steps">
            <li><span className="tv-up-step-num">1</span>Open the camera on your phone</li>
            <li><span className="tv-up-step-num">2</span>Scan the code → tap "Pair this TV"</li>
            <li><span className="tv-up-step-num">3</span>The slideshow starts automatically</li>
          </ol>
          <button className="btn btn-primary tv-up-cta" onClick={onPair}>
            Simulate pairing (demo) <Icons.ChevronRight size={14}/>
          </button>
        </div>
        <div className="tv-up-right">
          <div className="tv-up-qrcard">
            <div className="tv-up-qrwrap"><QRCode size={260}/></div>
            <div className="tv-up-pin">
              <div className="t-micro" style={{ textAlign: 'center', marginBottom: 6 }}>Or use this PIN</div>
              <div className="tv-up-pin-val t-mono">{pin}</div>
              <div className="tv-up-pin-expiry">expires in <span className="t-mono">{mins}:{String(secs).padStart(2,'0')}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="tv-up-foot">
        <span className="tv-up-foot-l">
          <span className="badge badge-success"><span className="dot" style={{ animation: 'pulse 2s ease-in-out infinite' }}/>Waiting for pairing</span>
        </span>
        <span className="tv-up-foot-r t-mono">tv-q2pulse-79f · {SEED.workspace}</span>
      </div>
    </div>
  );
}

// ---------- Paired (slideshow) state ----------
function TVPaired({ onUnpair }) {
  // Three slides we'll cycle through
  const slides = ['gauge', 'ranking', 'funnel'];
  const [idx, setIdx] = useStateT(0);
  const [reps, setReps] = useStateT(SEED.reps);
  const [now, setNow] = useStateT(new Date());

  // Slide auto-advance every 7s
  useEffectT(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % slides.length), 7000);
    return () => clearInterval(id);
  }, []);
  // Ranking shuffle every 4s while ranking slide is up — but keep shuffling regardless so when we return it's changed
  useEffectT(() => {
    const id = setInterval(() => {
      setReps(prev => {
        const next = prev.map(r => ({ ...r }));
        const i = Math.floor(Math.random() * next.length);
        let j = Math.floor(Math.random() * next.length);
        if (j === i) j = (j + 1) % next.length;
        const d = 2000 + Math.random() * 8000;
        next[i].value += d; next[j].value -= d * 0.55;
        return next;
      });
    }, 4000);
    return () => clearInterval(id);
  }, []);
  // Tick clock
  useEffectT(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2,'0'), mm = String(now.getMinutes()).padStart(2,'0');

  return (
    <div className="tv-paired">
      <div className="tv-glow"/>

      {/* Top-left brand */}
      <div className="tv-chrome tv-tl">
        <span className="tv-mark"/>
        <div>
          <div className="tv-ws-name">{SEED.workspace}</div>
          <div className="tv-ws-dash">{SEED.dashboardName}</div>
        </div>
      </div>

      {/* Top-right status */}
      <div className="tv-chrome tv-tr">
        <span className="tv-status">
          <span className="tv-dot" style={{ background: '#635BFF' }}/> Stripe
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>2m</span>
        </span>
        <span className="tv-status">
          <span className="tv-dot" style={{ background: '#FF7A59' }}/> HubSpot
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>3m</span>
        </span>
        <span className="tv-status tv-clock t-mono">{hh}:{mm}</span>
      </div>

      {/* Slides */}
      <div className="tv-stage">
        {slides.map((s, i) => (
          <div key={s} className={`tv-slide ${i === idx ? 'is-active' : ''}`}>
            {s === 'gauge' && <TVSlideGauge/>}
            {s === 'ranking' && <TVSlideRanking reps={reps}/>}
            {s === 'funnel' && <TVSlideFunnel/>}
          </div>
        ))}
      </div>

      {/* Bottom progress dots */}
      <div className="tv-chrome tv-bl">
        <div className="tv-dots">
          {slides.map((s, i) => (
            <span key={s} className={`tv-dot-prog ${i === idx ? 'is-active' : ''}`}>
              {i === idx && <span className="tv-dot-fill"/>}
            </span>
          ))}
        </div>
        <span className="t-small" style={{ color: 'var(--text-muted)' }}>
          Slide {idx + 1} of {slides.length}
        </span>
      </div>
      <div className="tv-chrome tv-br">
        <button className="btn btn-ghost btn-sm" onClick={onUnpair} style={{ color: 'var(--text-muted)' }}>
          <Icons.Close size={13}/> Unpair
        </button>
      </div>
    </div>
  );
}

// ---- Individual TV slide layouts (large-scale) ----
function TVSlideGauge() {
  return (
    <div className="tv-layout-gauge">
      <div className="tv-eyebrow">
        <span className="t-micro">Q2 Revenue Target</span>
        <span className="badge badge-success"><span className="dot"/>On track</span>
      </div>
      <div className="tv-gauge-wrap">
        <GaugeChart value={SEED.gauge.value} target={SEED.gauge.target}/>
      </div>
      <div className="tv-kpi-strip">
        <TVKpi label="MRR" value="€387K" delta="+9.0%" pos/>
        <TVKpi label="ARR" value="€4.65M" delta="+9.0%" pos/>
        <TVKpi label="Churn" value="2.4%" delta="−0.3pp" pos/>
        <TVKpi label="New customers" value="38" delta="+12" pos/>
      </div>
    </div>
  );
}
function TVKpi({ label, value, delta, pos }) {
  return (
    <div className="tv-kpi">
      <div className="t-micro">{label}</div>
      <div className="tv-kpi-val t-mono">{value}</div>
      <div className={`tv-kpi-delta ${pos ? 'up' : 'down'} t-mono`}>{pos ? '▲' : '▼'} {delta}</div>
    </div>
  );
}

function TVSlideRanking({ reps }) {
  // Larger, more cinematic ranking
  const sorted = [...reps].sort((a, b) => b.value - a.value);
  return (
    <div className="tv-layout-rank">
      <div className="tv-eyebrow">
        <span className="t-micro">Sales Team · May 2026</span>
        <span className="badge badge-brand"><span className="dot"/>Live reordering</span>
      </div>
      <h2 className="tv-h2">Top reps this month</h2>
      <div className="tv-rank-list">
        {sorted.map((r, i) => (
          <div key={r.id} className="tv-rank-row" style={{ '--y': `${i * 78}px`, zIndex: 100 - i }}>
            <div className={`tv-rank-num ${i === 0 ? 'top' : ''}`}><span className="t-mono">{i + 1}</span></div>
            <div className="tv-rank-avatar" style={{ background: r.color }}>{r.initials}</div>
            <div className="tv-rank-main">
              <div className="tv-rank-name-row">
                <span className="tv-rank-name">{r.name}</span>
                <span className="tv-rank-value t-mono">{fmtEUR(r.value)}</span>
              </div>
              <div className="tv-rank-bar-track">
                <div className="tv-rank-bar" style={{ width: `${Math.min(100, (r.value / r.target) * 100)}%` }}/>
              </div>
              <div className="tv-rank-meta">
                <span className="t-mono">{Math.round((r.value / r.target) * 100)}% of target · {fmtEUR(r.target)}</span>
                <span className={`t-mono ${r.delta >= 0 ? 'up' : 'down'}`}>
                  {r.delta >= 0 ? '↑' : '↓'} {Math.abs(r.delta)} this week
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TVSlideFunnel() {
  return (
    <div className="tv-layout-funnel">
      <div className="tv-eyebrow">
        <span className="t-micro">Pipeline · May 2026</span>
        <span className="badge"><Icons.TrendUp size={11}/>Conversion up 2.1pp</span>
      </div>
      <h2 className="tv-h2">From lead to closed-won</h2>
      <div className="tv-funnel-wrap">
        <FunnelChart stages={SEED.funnel}/>
      </div>
      <div className="tv-funnel-kpis">
        <div className="tv-kpi">
          <div className="t-micro">Lead → MQL</div>
          <div className="tv-kpi-val t-mono">44.6%</div>
        </div>
        <div className="tv-kpi">
          <div className="t-micro">MQL → Deal</div>
          <div className="tv-kpi-val t-mono">33.2%</div>
        </div>
        <div className="tv-kpi">
          <div className="t-micro">Deal → Won</div>
          <div className="tv-kpi-val t-mono">32.4%</div>
        </div>
        <div className="tv-kpi">
          <div className="t-micro">End-to-end</div>
          <div className="tv-kpi-val t-mono" style={{ color: 'var(--primary)' }}>4.8%</div>
        </div>
      </div>
    </div>
  );
}

// ---------- TV root ----------
function TVMode({ initialState = 'paired', onExit }) {
  const [state, setState] = useStateT(initialState);
  // Sync external prop changes (Tweaks toggle)
  useEffectT(() => { setState(initialState); }, [initialState]);

  return (
    <div className="tv-root">
      <button className="tv-exit" onClick={onExit} title="Exit TV mode">
        <Icons.Close size={16}/>
      </button>
      {state === 'unpaired'
        ? <TVUnpaired onPair={() => setState('paired')}/>
        : <TVPaired onUnpair={() => setState('unpaired')}/>}
    </div>
  );
}
window.TVMode = TVMode;
