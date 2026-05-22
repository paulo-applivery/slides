/* global React, ReactDOM, Icons, Dashboard, SlideshowEditor, TVMode, SEED,
   useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle */

const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "tvState": "paired"
}/*EDITMODE-END*/;

// =========================================================
// SIDEBAR
// =========================================================
function Sidebar({ screen, setScreen }) {
  const items = [
    { id: 'dashboard', label: 'Dashboards', icon: Icons.Dashboard, count: 7 },
    { id: 'slideshow', label: 'Slideshows', icon: Icons.Slideshow, count: 3 },
    { id: 'tv',        label: 'TV mode',    icon: Icons.TV,        count: null },
  ];
  const lower = [
    { id: 'queries',     label: 'Queries',     icon: Icons.Query,   count: 24 },
    { id: 'integrations',label: 'Integrations',icon: Icons.Plug,    count: 2 },
    { id: 'settings',    label: 'Settings',    icon: Icons.Settings,count: null },
  ];

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-brand-mark">
          <svg width="14" height="14" viewBox="0 0 70 70" fill="white">
            <path d="M35 0 L70 60 L55 56 L35 22 L15 56 L0 60 Z"/>
            <path d="M35 36 L45 56 L35 53 L25 56 Z"/>
          </svg>
        </div>
        <div className="sb-brand-text">
          <strong>Applivery</strong>
          <span>Slides</span>
        </div>
      </div>

      <div className="sb-section">Workspace</div>
      {items.map((it) => {
        const Ic = it.icon;
        return (
          <button key={it.id} className={`sb-item ${screen === it.id ? 'active' : ''}`} onClick={() => setScreen(it.id)}>
            <Ic size={16}/> {it.label}
            {it.count != null && <span className="sb-count">{it.count}</span>}
          </button>
        );
      })}

      <div className="sb-section">Data</div>
      {lower.map((it) => {
        const Ic = it.icon;
        return (
          <button key={it.id} className="sb-item" disabled>
            <Ic size={16}/> {it.label}
            {it.count != null && <span className="sb-count">{it.count}</span>}
          </button>
        );
      })}

      <div className="sb-foot">
        <div className="sb-foot-title">Data sources</div>
        <div className="sb-sync">
          <span className="sb-sync-dot"/>
          <span className="sb-sync-l">
            <span className="sb-sync-name brand-stripe">Stripe</span>
            <span className="sb-sync-meta">synced 2m ago · 1,284 charges</span>
          </span>
        </div>
        <div className="sb-sync">
          <span className="sb-sync-dot"/>
          <span className="sb-sync-l">
            <span className="sb-sync-name brand-hubspot">HubSpot</span>
            <span className="sb-sync-meta">synced 3m ago · 612 deals</span>
          </span>
        </div>
      </div>
    </aside>
  );
}

// =========================================================
// TOP BAR
// =========================================================
function TopBar({ screen, onLaunchTV }) {
  const titles = {
    dashboard: { crumbs: ['Dashboards'], name: SEED.dashboardName },
    slideshow: { crumbs: ['Slideshows'], name: 'Office TV — Sales Floor' },
    tv:        { crumbs: ['TV mode'],    name: 'Sales Floor display' },
  };
  const t = titles[screen] || titles.dashboard;
  return (
    <header className="tb">
      <div className="tb-title">
        <span className="tb-crumb">{SEED.workspace}</span>
        <span className="tb-crumb-sep">/</span>
        <span className="tb-crumb">{t.crumbs[0]}</span>
        <span className="tb-crumb-sep">/</span>
        <span className="tb-name">{t.name} <Icons.ChevronDown size={13}/></span>
      </div>
      <div className="tb-r">
        {screen === 'dashboard' && (
          <>
            <button className="btn btn-ghost"><Icons.Share size={14}/> Share</button>
            <button className="btn" onClick={onLaunchTV}><Icons.TV size={14}/> Launch on TV</button>
            <button className="btn btn-primary"><Icons.Save size={14}/> Save</button>
          </>
        )}
        {screen === 'slideshow' && (
          <>
            <button className="btn btn-ghost"><Icons.Eye size={14}/> Preview</button>
            <button className="btn btn-primary" onClick={onLaunchTV}><Icons.TV size={14}/> Launch on TV</button>
          </>
        )}
        {screen === 'tv' && (
          <button className="btn btn-primary" onClick={onLaunchTV}><Icons.Eye size={14}/> Open TV preview</button>
        )}
        <span className="tb-divider" style={{ width: 1, height: 24, background: 'var(--border)' }}/>
        <button className="btn btn-ghost btn-icon"><Icons.Bell size={16}/></button>
        <div className="avatar">{SEED.user.initials}</div>
      </div>
    </header>
  );
}

// =========================================================
// TV LAUNCHER preview screen (when /tv is selected from sidebar)
// =========================================================
function TVHomeScreen({ onLaunch, onLaunchUnpaired }) {
  return (
    <div className="main">
      <div className="tvhome">
        <div className="tvhome-card tvhome-hero">
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>Office TV · Sales Floor</div>
            <h1 style={{ fontSize: 32, fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Launch your TV
            </h1>
            <p style={{ color: 'var(--text-tertiary)', maxWidth: 480, marginTop: 4 }}>
              Push a slideshow to any screen using a 6-digit PIN or QR code. Once paired, the dashboard rotates and refreshes live with no further interaction needed.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button className="btn btn-primary" onClick={onLaunch}>
                <Icons.Play size={14}/> Open active slideshow
              </button>
              <button className="btn" onClick={onLaunchUnpaired}>
                <Icons.Plus size={14}/> Pair new TV
              </button>
            </div>
          </div>
          <div className="tvhome-screen">
            {/* mini preview */}
            <div className="tvhome-screen-inner">
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px' }}>
                <span className="t-micro">Volta Software</span>
                <span style={{ fontSize: 10, color: 'var(--success)' }}>● LIVE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '0 14px' }}>
                <div style={{ background: 'var(--bg-elev-2)', borderRadius: 8, padding: 10 }}>
                  <div className="t-micro" style={{ fontSize: 9 }}>MRR</div>
                  <div className="t-mono" style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 500 }}>€387K</div>
                </div>
                <div style={{ background: 'var(--bg-elev-2)', borderRadius: 8, padding: 10 }}>
                  <div className="t-micro" style={{ fontSize: 9 }}>Target</div>
                  <div className="t-mono" style={{ color: 'var(--warning)', fontSize: 22, fontWeight: 500 }}>77%</div>
                </div>
              </div>
              <div style={{ padding: 14, display: 'flex', gap: 6, justifyContent: 'center' }}>
                <span style={{ width: 24, height: 3, background: 'var(--primary)', borderRadius: 2 }}/>
                <span style={{ width: 24, height: 3, background: 'var(--bg-elev-3)', borderRadius: 2 }}/>
                <span style={{ width: 24, height: 3, background: 'var(--bg-elev-3)', borderRadius: 2 }}/>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
          <div className="tvhome-card">
            <Icons.TV size={20} style={{ color: 'var(--primary)' }}/>
            <div className="tvhome-stat-l">Paired TVs</div>
            <div className="t-mono tvhome-stat-v">3</div>
            <div className="t-small">Sales floor · Office lounge · Madrid HQ</div>
          </div>
          <div className="tvhome-card">
            <Icons.Refresh size={20} style={{ color: 'var(--success)' }}/>
            <div className="tvhome-stat-l">Last sync</div>
            <div className="t-mono tvhome-stat-v">2m</div>
            <div className="t-small">All sources online · auto every 5 min</div>
          </div>
          <div className="tvhome-card">
            <Icons.Slideshow size={20} style={{ color: 'var(--warning)' }}/>
            <div className="tvhome-stat-l">Active slideshows</div>
            <div className="t-mono tvhome-stat-v">2</div>
            <div className="t-small">Office TV — Sales Floor · Weekly review</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================
// ROOT
// =========================================================
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = useStateA('dashboard');
  const [tvActive, setTvActive] = useStateA(false);
  const [tvInitial, setTvInitial] = useStateA('paired');

  useEffectA(() => {
    document.documentElement.dataset.theme = t.theme;
  }, [t.theme]);

  const launchTV = (state = 'paired') => {
    setTvInitial(state);
    setTvActive(true);
  };

  return (
    <>
      <div className="app">
        <Sidebar screen={screen} setScreen={(s) => { setScreen(s); }}/>
        <TopBar screen={screen} onLaunchTV={() => launchTV(screen === 'tv' ? tvInitial : 'paired')}/>
        {screen === 'dashboard' && <Dashboard/>}
        {screen === 'slideshow' && <SlideshowEditor/>}
        {screen === 'tv' && <TVHomeScreen onLaunch={() => launchTV('paired')} onLaunchUnpaired={() => launchTV('unpaired')}/>}
      </div>

      {tvActive && <TVMode initialState={tvInitial} onExit={() => setTvActive(false)}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme"/>
        <TweakRadio
          label="Mode"
          value={t.theme}
          options={['dark', 'light']}
          onChange={(v) => setTweak('theme', v)}
        />
        <TweakSection label="TV demo"/>
        <TweakRadio
          label="TV state"
          value={t.tvState}
          options={['paired', 'unpaired']}
          onChange={(v) => { setTweak('tvState', v); setTvInitial(v); if (tvActive) { setTvActive(false); setTimeout(() => setTvActive(true), 30); } }}
        />
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
