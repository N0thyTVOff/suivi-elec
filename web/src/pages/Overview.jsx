import { useEffect, useMemo, useState } from 'react';
import { Activity, CircleEuro, Gauge, PlugZap, TrendingDown, TrendingUp } from 'lucide-react';
import Chart from '../Chart.jsx';
import { api, fmtEur, fmtKwh, fmtW, subscribe } from '../api.js';
import { baseAxes, chartTheme } from '../theme.js';

const FRESH_MS = 150_000;

export default function Overview() {
  const [summary, setSummary] = useState(null);
  const [readings, setReadings] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const load = () =>
      api('summary')
        .then(setSummary)
        .catch(() => {});
    load();
    api('readings/recent?minutes=30')
      .then(setReadings)
      .catch(() => {});
    api('journal?limit=4')
      .then(setEvents)
      .catch(() => {});
    const timer = setInterval(load, 60_000);
    const off = subscribe(
      {
        reading: (reading) => {
          setReadings((current) => [...current.slice(-239), reading]);
          load();
        },
        notice: (event) => setEvents((current) => [event, ...current].slice(0, 4)),
      },
      load,
    );
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);

  const theme = chartTheme();
  const axes = baseAxes(theme);
  const aggregated = useMemo(() => {
    const buckets = new Map();
    for (const reading of readings) {
      const bucket = Math.floor(reading.ts / 60_000) * 60_000;
      const row = buckets.get(bucket) || new Map();
      row.set(reading.deviceId, reading.watts);
      buckets.set(bucket, row);
    }
    return [...buckets.entries()].map(([ts, devices]) => [
      ts,
      [...devices.values()].reduce((total, watts) => total + watts, 0),
    ]);
  }, [readings]);

  const chart = {
    ...axes,
    grid: { left: 48, right: 16, top: 18, bottom: 30 },
    tooltip: { ...axes.tooltip, trigger: 'axis', valueFormatter: (value) => fmtW(value) },
    xAxis: { ...axes.xAxis, type: 'time' },
    yAxis: { ...axes.yAxis, type: 'value', name: 'W', nameTextStyle: { color: theme.muted } },
    series: [
      {
        name: 'Prises',
        type: 'line',
        smooth: 0.28,
        showSymbol: false,
        lineStyle: { width: 3, color: theme.series[0] },
        areaStyle: { opacity: 0.16, color: theme.series[0] },
        data: aggregated,
      },
    ],
  };

  if (!summary) return <div className="empty-state">Connexion aux données de Wattelier…</div>;

  const devices = summary.devices || [];
  const active = devices.filter((device) => Date.now() - device.ts < FRESH_MS);
  const price = Number(summary.prices?.kwh) || 0;
  const todayEnergy = summary.todayHouseKwh ?? summary.todayPlugsKwh;
  const todaySource = summary.todayHouseKwh != null ? 'Logement · Linky' : 'Prises mesurées';
  const kva = Number(summary.prices?.kva) || 6;
  const loadPercent = Math.min(100, (summary.nowW / (kva * 1000)) * 100);
  const yesterday = summary.yesterdayHouseKwh ?? summary.yesterdayPlugsKwh;
  const delta = yesterday ? ((todayEnergy - yesterday) / yesterday) * 100 : null;

  return (
    <div className="dashboard-stack">
      <section className="metric-grid" aria-label="Indicateurs énergétiques">
        <article className="metric-card metric-card-primary">
          <div className="metric-label">
            <Gauge size={17} /> Puissance actuelle des prises
          </div>
          <div className="metric-value">{fmtW(summary.nowW)}</div>
          <div className="metric-context">
            {active.length}/{devices.length} appareil(s) avec une mesure récente
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-label">
            <Activity size={17} /> Consommation du jour
          </div>
          <div className="metric-value">{fmtKwh(todayEnergy)}</div>
          <div className="metric-context">{todaySource}</div>
        </article>
        <article className="metric-card">
          <div className="metric-label">
            <CircleEuro size={17} /> Coût estimé aujourd’hui
          </div>
          <div className="metric-value">{fmtEur(todayEnergy * price)}</div>
          <div className="metric-context">
            {delta == null ? (
              'Comparaison disponible après deux jours'
            ) : (
              <span className={delta > 0 ? 'delta-up' : 'delta-down'}>
                {delta > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {Math.abs(delta).toFixed(0)} % par rapport à hier
              </span>
            )}
          </div>
        </article>
        <article className="metric-card">
          <div className="metric-label">
            <PlugZap size={17} /> Charge mesurée / {kva} kVA
          </div>
          <div className="metric-value">{loadPercent.toFixed(0)} %</div>
          <div
            className="signal-progress"
            aria-label={`${loadPercent.toFixed(0)} % de la puissance souscrite`}
          >
            <span style={{ width: `${loadPercent}%` }} />
          </div>
        </article>
      </section>

      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Activité des prises</h2>
              <p>Puissance cumulée sur les 30 dernières minutes</p>
            </div>
            <span className="live-indicator">
              <span /> En direct
            </span>
          </div>
          {aggregated.length > 1 ? (
            <Chart option={chart} height={300} />
          ) : (
            <div className="empty-state compact">En attente de nouvelles mesures…</div>
          )}
        </section>

        <section className="panel device-summary">
          <div className="panel-heading">
            <div>
              <h2>Appareils</h2>
              <p>{active.length} actif(s) récemment</p>
            </div>
          </div>
          <div className="device-summary-list">
            {devices.slice(0, 5).map((device) => (
              <div className="device-summary-row" key={device.device_id}>
                <span className="device-symbol">
                  <PlugZap size={16} />
                </span>
                <span>
                  <strong>{device.name}</strong>
                  <small>{device.online ? 'En ligne' : 'Hors ligne'}</small>
                </span>
                <b>{fmtW(device.watts)}</b>
              </div>
            ))}
            {devices.length === 0 && (
              <div className="empty-state compact">Aucun appareil configuré.</div>
            )}
          </div>
        </section>
      </div>

      {events.length > 0 && (
        <section className="panel event-strip">
          <div className="panel-heading">
            <div>
              <h2>Événements récents</h2>
              <p>Les dernières informations utiles du serveur</p>
            </div>
          </div>
          <div className="event-grid">
            {events.map((event, index) => (
              <div className="event-item" key={`${event.ts}-${index}`}>
                <time>
                  {new Date(event.ts).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
