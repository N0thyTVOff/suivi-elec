import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from '../Chart.jsx';
import { api, post, subscribe, fmtW, fmtKwh, fmtEur } from '../api.js';
import { chartTheme, baseAxes } from '../theme.js';

// fraîcheur d'un relevé : couvre la cadence LAN (~10 s) comme la cadence cloud (~60 s)
const FRESH_MS = 150_000;

export default function RealTime() {
  const [summary, setSummary] = useState(null);
  const [latest, setLatest] = useState({}); // deviceId → dernier relevé
  const [todayByDevice, setTodayByDevice] = useState({}); // deviceId → kWh du jour
  const [switchByDevice, setSwitchByDevice] = useState({}); // deviceId → 'on'|'off'
  const [toggling, setToggling] = useState({}); // deviceId → true pendant l'envoi
  const [events, setEvents] = useState([]);
  const [totalSeries, setTotalSeries] = useState([]); // [{ts, watts}]
  const perDevice = useRef({}); // deviceId → [{ts, watts}]
  const latestRef = useRef({});
  const [, force] = useState(0);

  const pushReading = (r) => {
    latestRef.current = { ...latestRef.current, [r.deviceId]: r };
    const total = Object.values(latestRef.current)
      .filter((d) => r.ts - d.ts < FRESH_MS)
      .reduce((s, d) => s + d.watts, 0);
    setTotalSeries((ts) => [...ts.slice(-240), { ts: r.ts, watts: Math.round(total) }]);
    const arr = perDevice.current[r.deviceId] || (perDevice.current[r.deviceId] = []);
    arr.push({ ts: r.ts, watts: r.watts });
    if (arr.length > 240) arr.shift();
    setLatest(latestRef.current);
  };

  useEffect(() => {
    // amorce : les relevés des 30 dernières minutes déjà en base
    api('readings/recent?minutes=30')
      .then((rows) => {
        for (const r of rows) pushReading(r);
        force((n) => n + 1);
      })
      .catch(() => {});

    api('journal?limit=20')
      .then(setEvents)
      .catch(() => {});

    const load = () =>
      api('summary')
        .then((s) => {
          setSummary(s);
          setTodayByDevice(Object.fromEntries(s.devices.map((d) => [d.device_id, d.todayKwh])));
          setSwitchByDevice(
            Object.fromEntries(s.devices.map((d) => [d.device_id, d.switch_state])),
          );
          for (const d of s.devices) {
            const cur = latestRef.current[d.device_id];
            if (!cur || cur.ts < d.ts) {
              latestRef.current = {
                ...latestRef.current,
                [d.device_id]: {
                  deviceId: d.device_id,
                  name: d.name,
                  ts: d.ts,
                  watts: d.watts,
                  volts: d.volts,
                  amps: d.amps,
                },
              };
            }
          }
          setLatest(latestRef.current);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);

    const off = subscribe(
      {
        reading: (r) => pushReading(r),
        notice: (ev) => setEvents((prev) => [ev, ...prev].slice(0, 20)),
      },
      // flux recréé après une coupure (veille, réseau…) : on recharge tout
      () => {
        load();
        api('journal?limit=20')
          .then(setEvents)
          .catch(() => {});
        api('readings/recent?minutes=30')
          .then((rows) => {
            for (const r of rows) {
              const cur = latestRef.current[r.deviceId];
              if (!cur || cur.ts < r.ts) pushReading(r);
            }
            force((n) => n + 1);
          })
          .catch(() => {});
      },
    );
    return () => {
      clearInterval(t);
      off();
    };
  }, []);

  const toggleSwitch = async (deviceId) => {
    const next = switchByDevice[deviceId] !== 'on';
    setToggling((p) => ({ ...p, [deviceId]: true }));
    try {
      const r = await post(`devices/${deviceId}/switch`, { on: next });
      setSwitchByDevice((p) => ({ ...p, [deviceId]: r.state }));
    } catch {
      // échec (prise injoignable) : on garde l'état affiché
    } finally {
      setToggling((p) => ({ ...p, [deviceId]: false }));
    }
  };

  const t = chartTheme();
  const axes = baseAxes(t);
  const devices = Object.values(latest).sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  const fresh = devices.filter((d) => Date.now() - d.ts < FRESH_MS);
  const nowW = fresh.reduce((s, d) => s + d.watts, 0);
  const prices = summary?.prices || {};
  const kva = Number(prices.kva) || 6;
  const priceKwh = Number(prices.kwh) || 0;
  const pctSouscrite = Math.min((nowW / (kva * 1000)) * 100, 100);

  const todayPlugs = summary?.todayPlugsKwh ?? 0;
  const yesterdayPlugs = summary?.yesterdayPlugsKwh ?? null;
  const yesterdayHouse = summary?.yesterdayHouseKwh ?? null;

  const totalOption = useMemo(
    () => ({
      ...axes,
      grid: { left: 50, right: 16, top: 20, bottom: 28 },
      tooltip: {
        ...axes.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'cross', label: { backgroundColor: t.surface, color: t.ink } },
      },
      xAxis: { ...axes.xAxis, type: 'time' },
      yAxis: { ...axes.yAxis, type: 'value', name: 'W', nameTextStyle: { color: t.muted } },
      series: [
        {
          name: 'Total prises',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: t.series[0] },
          itemStyle: { color: t.series[0] },
          areaStyle: { opacity: 0.08, color: t.series[0] },
          data: totalSeries.map((p) => [p.ts, p.watts]),
        },
      ],
    }),
    [totalSeries, t.series[0]],
  );

  const perDevOption = useMemo(() => {
    const ids = devices.map((d) => d.deviceId);
    return {
      ...axes,
      grid: { left: 50, right: 16, top: 34, bottom: 28 },
      legend: { ...axes.legend, top: 0 },
      tooltip: { ...axes.tooltip, trigger: 'axis', valueFormatter: (v) => `${Math.round(v)} W` },
      xAxis: { ...axes.xAxis, type: 'time' },
      yAxis: { ...axes.yAxis, type: 'value', name: 'W', nameTextStyle: { color: t.muted } },
      series: ids.map((id, i) => ({
        name: latest[id]?.name || id,
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: t.series[i % 8] },
        itemStyle: { color: t.series[i % 8] },
        data: (perDevice.current[id] || []).map((p) => [p.ts, p.watts]),
      })),
    };
  }, [devices.length, totalSeries, t.series[0]]);

  if (summary && devices.length === 0) {
    return (
      <div className="empty">
        <p>
          <strong>Aucune prise détectée pour l'instant.</strong>
        </p>
        <p>
          Activez et configurez le connecteur eWeLink dans les Réglages,
          <br />
          ou activez le <em>mode démo</em> dans les Réglages pour explorer le dashboard avec des
          données factices.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Puissance actuelle (prises)</div>
          <div className="value">{fmtW(nowW)}</div>
          <div className="sub">
            {fresh.length}/{devices.length} prise(s) avec relevé récent
            {nowW > 0 &&
              priceKwh > 0 &&
              ` · ≈ ${fmtEur((nowW / 1000) * 24 * priceKwh)}/jour à ce rythme`}
          </div>
        </div>
        <div className="card">
          <div className="label">Aujourd'hui — prises</div>
          <div className="value">{fmtKwh(todayPlugs)}</div>
          <div className="sub">
            {fmtEur(todayPlugs * priceKwh)}
            {summary?.todayHouseKwh != null
              ? ` · maison : ${fmtKwh(summary.todayHouseKwh)}`
              : ' · total maison connu à J+1'}
          </div>
        </div>
        <div className="card">
          <div className="label">Hier</div>
          <div className="value">
            {yesterdayHouse != null
              ? fmtKwh(yesterdayHouse)
              : yesterdayPlugs != null
                ? fmtKwh(yesterdayPlugs)
                : '—'}
          </div>
          <div className="sub">
            {yesterdayHouse != null &&
              `maison (${summary?.yesterdayHouseFrom === 'manuel' ? 'relevé manuel' : 'Linky'})`}
            {yesterdayHouse != null &&
              yesterdayPlugs != null &&
              ` · prises : ${fmtKwh(yesterdayPlugs)}`}
            {yesterdayHouse == null && yesterdayPlugs != null && 'prises uniquement'}
            {yesterdayPlugs != null && yesterdayPlugs > 0 && (
              <>
                {' '}
                <span className={todayPlugs > yesterdayPlugs ? 'delta-up' : 'delta-down'}>
                  {todayPlugs > yesterdayPlugs ? '▲' : '▼'}{' '}
                  {Math.abs(((todayPlugs - yesterdayPlugs) / yesterdayPlugs) * 100).toFixed(0)} %
                  prises vs hier (en cours)
                </span>
              </>
            )}
          </div>
        </div>
        <div className="card">
          <div className="label">Charge vs abonnement {kva} kVA</div>
          <div className="value">
            {pctSouscrite.toFixed(0)} <small>%</small>
          </div>
          <div style={{ height: 6, borderRadius: 4, background: 'var(--grid)', marginTop: 8 }}>
            <div
              style={{
                height: 6,
                borderRadius: 4,
                width: `${pctSouscrite}%`,
                background:
                  pctSouscrite > 90
                    ? 'var(--crit)'
                    : pctSouscrite > 70
                      ? 'var(--warn)'
                      : 'var(--ok)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>
          Puissance totale des prises{' '}
          <span className="hint">~10 s en liaison locale, ~1 min via le cloud eWeLink</span>
        </h2>
        {totalSeries.length < 2 ? (
          <div className="empty">En attente des premiers relevés…</div>
        ) : (
          <Chart option={totalOption} height={260} />
        )}
      </div>

      <div className="panel">
        <h2>Par prise</h2>
        {totalSeries.length < 2 ? (
          <div className="empty">En attente des premiers relevés…</div>
        ) : (
          <Chart option={perDevOption} height={300} />
        )}
      </div>

      <div className="panel">
        <h2>Dernier relevé par prise</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Prise</th>
                <th>⏻</th>
                <th>État</th>
                <th className="num">Puissance</th>
                <th className="num">Aujourd'hui</th>
                <th className="num">Tension</th>
                <th className="num">Courant</th>
                <th className="num">Il y a</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d, i) => {
                const state =
                  d.watts > 20
                    ? { label: 'Actif', color: 'var(--ok)' }
                    : d.watts >= 0.5
                      ? { label: 'Veille', color: 'var(--warn)' }
                      : { label: 'Inactif', color: 'var(--muted)' };
                const sw = switchByDevice[d.deviceId];
                return (
                  <tr key={d.deviceId}>
                    <td>
                      <span className="swatch" style={{ background: t.series[i % 8] }} />
                      {d.name}
                    </td>
                    <td>
                      <button
                        className={`toggle ${sw === 'on' ? 'on' : ''}`}
                        style={{
                          border: 'none',
                          background: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          opacity: toggling[d.deviceId] ? 0.4 : 1,
                        }}
                        title={sw === 'on' ? 'Éteindre la prise' : 'Allumer la prise'}
                        disabled={toggling[d.deviceId]}
                        onClick={() => toggleSwitch(d.deviceId)}
                      >
                        <span className="track" />
                      </button>
                    </td>
                    <td>
                      <span className="dot" style={{ background: state.color, marginRight: 6 }} />
                      {state.label}
                    </td>
                    <td className="num">{fmtW(d.watts)}</td>
                    <td className="num">{fmtKwh(todayByDevice[d.deviceId] ?? 0)}</td>
                    <td className="num">{d.volts != null ? `${d.volts.toFixed(1)} V` : '—'}</td>
                    <td className="num">{d.amps != null ? `${d.amps.toFixed(2)} A` : '—'}</td>
                    <td className="num">{Math.max(0, Math.round((Date.now() - d.ts) / 1000))} s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          L'interrupteur ⏻ agit réellement sur la prise (réseau local en priorité, cloud sinon).
        </p>
      </div>

      <div className="panel">
        <h2>Événements récents</h2>
        {events.length === 0 ? (
          <div className="empty">Rien à signaler pour l'instant.</div>
        ) : (
          <table className="data">
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.ts}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', width: 130 }}>
                    {new Date(e.ts).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
