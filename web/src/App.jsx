import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CircleGauge,
  History as HistoryIcon,
  Laptop,
  Moon,
  PlugZap,
  ReceiptText,
  Settings2,
  Sun,
} from 'lucide-react';
import { api, subscribe } from './api.js';
import Overview from './pages/Overview.jsx';
import RealTime from './pages/RealTime.jsx';
import History from './pages/History.jsx';
import Devices from './pages/Devices.jsx';
import Advanced from './pages/Advanced.jsx';
import Billing from './pages/Billing.jsx';
import Settings from './pages/Settings.jsx';
import Onboarding, { ServerLogin } from './pages/Onboarding.jsx';

const PAGES = [
  { id: 'overview', label: "Vue d'ensemble", short: 'Accueil', icon: CircleGauge },
  { id: 'realtime', label: 'Temps réel', short: 'Direct', icon: Activity },
  { id: 'history', label: 'Historique', short: 'Historique', icon: HistoryIcon },
  { id: 'devices', label: 'Appareils', short: 'Appareils', icon: PlugZap },
  { id: 'advanced', label: 'Analyses', short: 'Analyses', icon: BarChart3 },
  { id: 'billing', label: 'Facturation', short: 'Factures', icon: ReceiptText },
  { id: 'settings', label: 'Réglages', short: 'Réglages', icon: Settings2 },
];

function sourceState(status, source) {
  if (!status) return 'pending';
  if (source === 'linky') {
    if (!status.connectors?.linky || !status.linky.configured) return 'off';
    if (status.linky.lastError) return 'error';
    return status.linky.waitingForData ? 'pending' : 'ok';
  }
  if (source === 'omajin') {
    if (!status.connectors?.omajin || !status.omajin.configured) return 'off';
    if (status.omajin.lastError) return 'error';
    return status.omajin.cloudOnline ? 'ok' : 'pending';
  }
  if (!status.connectors?.ewelink || !status.sonoff.configured) return 'off';
  if (status.sonoff.lastError) return 'error';
  return status.sonoff.cloudOnline || status.sonoff.lanDevices > 0 ? 'ok' : 'pending';
}

function SourceStatus({ label, state }) {
  return (
    <span className={`source-status ${state}`}>
      <span />
      {label}
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [status, setStatus] = useState(null);
  const [access, setAccess] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'auto');
  const current = useMemo(() => PAGES.find((item) => item.id === page) || PAGES[0], [page]);

  const refreshAccess = useCallback(
    () =>
      api('setup/status')
        .then(setAccess)
        .catch(() => setAccess({ error: true })),
    [],
  );
  useEffect(refreshAccess, [refreshAccess]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    localStorage.setItem('theme', theme);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!access?.authenticated) return undefined;
    const load = () =>
      api('status')
        .then(setStatus)
        .catch(() => {});
    load();
    const timer = setInterval(load, 30_000);
    const off = subscribe({ status: load, linky: load }, load);
    return () => {
      clearInterval(timer);
      off();
    };
  }, [access?.authenticated]);

  if (!access)
    return (
      <div className="launch-screen">
        <img src="/brand/wattelier-mark.svg" alt="" />
        <p>Connexion à Wattelier…</p>
      </div>
    );
  if (access.error)
    return (
      <div className="launch-screen error">
        <img src="/brand/wattelier-mark.svg" alt="" />
        <h1>Serveur indisponible</h1>
        <p>Wattelier ne parvient pas à joindre son serveur local.</p>
      </div>
    );
  if (!access.onboardingCompleted)
    return <Onboarding tariffs={access.tariffs} onReady={refreshAccess} />;
  if (access.authRequired && !access.authenticated) return <ServerLogin onReady={refreshAccess} />;

  const cycleTheme = () =>
    setTheme(theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto');
  const ThemeIcon = theme === 'auto' ? Laptop : theme === 'light' ? Sun : Moon;

  const content = {
    overview: <Overview />,
    realtime: <RealTime />,
    history: <History />,
    devices: <Devices />,
    advanced: <Advanced />,
    billing: <Billing />,
    settings: <Settings status={status} />,
  }[page];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/brand/wattelier-mark.svg" alt="" />
          <span>Wattelier</span>
        </div>
        <nav className="side-navigation" aria-label="Navigation principale">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => setPage(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <div className="server-status">
            <span className="pulse-dot" />
            <span>
              <strong>Serveur actif</strong>
              <small>Réseau local · port {status?.server?.port || 3017}</small>
            </span>
          </div>
          <div className="source-statuses">
            <SourceStatus label="Linky" state={sourceState(status, 'linky')} />
            <SourceStatus label="eWeLink" state={sourceState(status, 'ewelink')} />
            <SourceStatus label="Omajin" state={sourceState(status, 'omajin')} />
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="workspace-header">
          <div>
            <p>
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
            <h1>{current.label}</h1>
          </div>
          <div className="header-actions">
            {status?.demo && <span className="demo-badge">Mode démo</span>}
            <button
              className="icon-button"
              onClick={cycleTheme}
              aria-label={`Thème ${theme}`}
              title={`Thème : ${theme}`}
            >
              <ThemeIcon size={19} />
            </button>
          </div>
        </header>
        <main key={`${page}-${theme}`}>{content}</main>
      </div>

      <nav className="mobile-navigation" aria-label="Navigation mobile">
        {PAGES.map(({ id, short, icon: Icon }) => (
          <button
            key={id}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <Icon size={18} />
            <span>{short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
