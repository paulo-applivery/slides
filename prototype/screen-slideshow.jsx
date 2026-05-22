/* global React, Icons, SEED */
// =========================================================
// SLIDESHOW EDITOR
// =========================================================
const { useState: useStateS } = React;

const DEFAULT_SLIDES = [
  { id: 's1', type: 'dashboard', name: 'Q2 Revenue Pulse', subtitle: 'Live dashboard · 5 widgets', duration: 30, transition: 'crossfade' },
  { id: 's2', type: 'dashboard', name: 'Sales Team Ranking', subtitle: 'Leaderboard focus view', duration: 15, transition: 'crossfade' },
  { id: 's3', type: 'youtube',   name: 'All-hands kickoff', subtitle: 'youtu.be/XfXG0t1Qb4M', duration: 90, transition: 'slide' },
  { id: 's4', type: 'dashboard', name: 'Pipeline Funnel',   subtitle: 'HubSpot deals breakdown', duration: 20, transition: 'crossfade' },
  { id: 's5', type: 'url',       name: 'Status page',       subtitle: 'status.volta.so', duration: 12, transition: 'slide' },
];

const TYPE_META = {
  dashboard: { icon: Icons.Dashboard, label: 'Dashboard', color: 'var(--primary)' },
  youtube:   { icon: Icons.Youtube,  label: 'YouTube',   color: '#FF0033' },
  url:       { icon: Icons.Globe,    label: 'Web URL',   color: 'var(--success)' },
};

function SlideshowEditor() {
  const [slides, setSlides] = useStateS(DEFAULT_SLIDES);
  const [selectedId, setSelectedId] = useStateS('s1');
  const selected = slides.find(s => s.id === selectedId) || slides[0];
  const totalDuration = slides.reduce((a, s) => a + s.duration, 0);
  const mins = Math.floor(totalDuration / 60);
  const secs = totalDuration % 60;

  const update = (patch) => setSlides(slides.map(s => s.id === selected.id ? { ...s, ...patch } : s));

  return (
    <div className="main slideshow-main">
      <div className="ss-grid">
        {/* Left — slides list */}
        <div className="ss-left">
          <div className="ss-left-head">
            <div>
              <div className="t-micro">Sequence</div>
              <div className="ss-left-title">{slides.length} slides · {mins}:{String(secs).padStart(2,'0')}</div>
            </div>
            <button className="btn btn-sm"><Icons.Plus size={14}/>Add slide</button>
          </div>

          <div className="ss-list">
            {slides.map((s, i) => {
              const Meta = TYPE_META[s.type];
              const Icon = Meta.icon;
              const active = s.id === selected.id;
              return (
                <button
                  key={s.id}
                  className={`ss-slide ${active ? 'active' : ''}`}
                  onClick={() => setSelectedId(s.id)}
                >
                  <span className="ss-slide-handle"><Icons.Drag size={14}/></span>
                  <span className="ss-slide-num t-mono">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ss-slide-thumb" style={{ background: `linear-gradient(135deg, ${Meta.color}33, transparent)` }}>
                    <Icon size={20} style={{ color: Meta.color }}/>
                  </span>
                  <span className="ss-slide-meta">
                    <span className="ss-slide-name">{s.name}</span>
                    <span className="ss-slide-sub">{s.subtitle}</span>
                  </span>
                  <span className="ss-slide-dur t-mono">{s.duration}s</span>
                </button>
              );
            })}
            <button className="ss-slide-add">
              <Icons.Plus size={14}/> Add slide
            </button>
          </div>
        </div>

        {/* Right — preview + config */}
        <div className="ss-right">
          <div className="ss-preview-head">
            <div>
              <div className="t-micro">Preview · slide {slides.findIndex(s => s.id === selected.id) + 1} of {slides.length}</div>
              <div className="ss-preview-title">{selected.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm"><Icons.Eye size={14}/> Open in TV</button>
              <button className="btn btn-primary btn-sm"><Icons.Save size={14}/> Save changes</button>
            </div>
          </div>

          <div className="ss-preview">
            <SlidePreview slide={selected}/>
          </div>

          <div className="ss-config">
            <div className="ss-config-row">
              <label className="ss-config-label">Slide type</label>
              <div className="ss-segmented">
                {Object.entries(TYPE_META).map(([key, m]) => {
                  const Ic = m.icon;
                  return (
                    <button key={key} className={`ss-seg ${selected.type === key ? 'active' : ''}`} onClick={() => update({ type: key })}>
                      <Ic size={14}/> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ss-config-row">
              <label className="ss-config-label">
                {selected.type === 'dashboard' ? 'Dashboard' : selected.type === 'youtube' ? 'YouTube URL' : 'Web URL'}
              </label>
              <div className="ss-input-wrap">
                <input
                  className="ss-input"
                  value={selected.type === 'dashboard' ? selected.name : selected.subtitle}
                  onChange={(e) => update(selected.type === 'dashboard' ? { name: e.target.value } : { subtitle: e.target.value })}
                />
                {selected.type === 'dashboard' && <span className="ss-input-hint"><Icons.ChevronDown size={14}/></span>}
              </div>
            </div>

            <div className="ss-config-grid">
              <div className="ss-config-row">
                <label className="ss-config-label">Display duration</label>
                <div className="ss-stepper">
                  <input className="ss-input ss-input-mono" value={`${selected.duration}s`} readOnly/>
                  <div className="ss-stepper-btns">
                    <button onClick={() => update({ duration: Math.max(5, selected.duration - 5) })}>−</button>
                    <button onClick={() => update({ duration: selected.duration + 5 })}>+</button>
                  </div>
                </div>
              </div>
              <div className="ss-config-row">
                <label className="ss-config-label">Transition</label>
                <div className="ss-segmented">
                  <button className={`ss-seg ${selected.transition === 'crossfade' ? 'active' : ''}`} onClick={() => update({ transition: 'crossfade' })}>Crossfade</button>
                  <button className={`ss-seg ${selected.transition === 'slide' ? 'active' : ''}`} onClick={() => update({ transition: 'slide' })}>Slide</button>
                  <button className={`ss-seg ${selected.transition === 'cut' ? 'active' : ''}`} onClick={() => update({ transition: 'cut' })}>Cut</button>
                </div>
              </div>
            </div>

            <div className="ss-config-meta">
              <span className="t-small"><Icons.Wifi size={13}/> Auto-loops indefinitely</span>
              <span className="t-small">TV URL · <code className="t-mono ss-url">app.applivery.com/tv/q2-pulse-79f</code></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Mini in-canvas slide preview (purely visual) ----
function SlidePreview({ slide }) {
  if (slide.type === 'dashboard') {
    return (
      <div className="prev-shell">
        <div className="prev-dash-meta">
          <span className="t-micro">{slide.name}</span>
          <span className="t-micro" style={{ color: 'var(--success)' }}>● LIVE</span>
        </div>
        <div className="prev-dash-grid">
          <div className="prev-card">
            <div className="prev-label">MRR</div>
            <div className="prev-num t-mono">€387K</div>
            <div className="prev-spark">
              <svg viewBox="0 0 80 20" width="80" height="20">
                <path d="M0 15 L10 13 L20 10 L30 11 L40 8 L50 7 L60 5 L70 4 L80 2" stroke="var(--success)" strokeWidth="1.5" fill="none"/>
              </svg>
            </div>
          </div>
          <div className="prev-card">
            <div className="prev-label">Q2 Target</div>
            <div className="prev-num t-mono" style={{ color: 'var(--warning)' }}>77%</div>
            <div className="prev-bar"><div className="prev-bar-fill" style={{ width: '77%', background: 'var(--warning)' }}/></div>
          </div>
          <div className="prev-card prev-card-wide">
            <div className="prev-label">Top reps</div>
            <div className="prev-leaders">
              {SEED.reps.slice(0, 3).map((r, i) => (
                <div key={r.id} className="prev-leader">
                  <span className="t-mono prev-leader-num">{i + 1}</span>
                  <span className="prev-leader-dot" style={{ background: r.color }}/>
                  <span className="prev-leader-name">{r.name}</span>
                  <span className="t-mono prev-leader-val">€{Math.round(r.value/1000)}K</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (slide.type === 'youtube') {
    return (
      <div className="prev-yt">
        <div className="prev-yt-frame">
          <Icons.Play size={64} style={{ color: 'rgba(255,255,255,.9)' }}/>
        </div>
        <div className="prev-yt-label">
          <Icons.Youtube size={14} style={{ color: '#FF0033' }}/> {slide.subtitle}
        </div>
      </div>
    );
  }
  // URL
  return (
    <div className="prev-url">
      <div className="prev-url-bar">
        <span style={{ display: 'flex', gap: 6 }}>
          <span className="prev-tl" style={{ background: '#FF6058' }}/>
          <span className="prev-tl" style={{ background: '#FFBD2E' }}/>
          <span className="prev-tl" style={{ background: '#28C941' }}/>
        </span>
        <span className="t-mono prev-url-addr">{slide.subtitle}</span>
      </div>
      <div className="prev-url-body">
        <Icons.Globe size={36} style={{ color: 'var(--text-muted)' }}/>
        <div className="t-small">Web URL embed · {slide.subtitle}</div>
      </div>
    </div>
  );
}

window.SlideshowEditor = SlideshowEditor;
