import { useEffect, useMemo, useState } from 'react';
import Chart from '../Chart.jsx';
import { api, post, fmtKwh, fmtEur, localDate, daysAgo } from '../api.js';
import { chartTheme, baseAxes } from '../theme.js';

const PERIODS = [
  ['today', "Aujourd'hui"],
  ['7', '7 jours'],
  ['30', '30 jours'],
  ['month', 'Mois en cours'],
];

function periodDates(p) {
  const today = localDate();
  if (p === 'today') return [today, today];
  if (p === 'month') return [today.slice(0, 8) + '01', today];
  return [daysAgo(Number(p)), today];
}

export default function Devices() {
  const [period, setPeriod] = useState('7');
  const [data, setData] = useState(null);
  const [allDevices, setAllDevices] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [devStats, setDevStats] = useState([]);
  const [profileRows, setProfileRows] = useState([]);
  const [dayDate, setDayDate] = useState(localDate());
  const [dayRows, setDayRows] = useState([]);
  const [edit, setEdit] = useState({}); // id → {name, room}

  const load = () => {
    const [start, end] = periodDates(period);
    api(`breakdown?start=${start}&end=${end}`)
      .then(setData)
      .catch(() => {});
    api('devices')
      .then(setAllDevices)
      .catch(() => {});
    api(`devices/daily?start=${start}&end=${end}`)
      .then(setHistoryRows)
      .catch(() => {});
    api(`devices/stats?start=${start}&end=${end}`)
      .then(setDevStats)
      .catch(() => {});
    api(`profile?start=${start}&end=${end}`)
      .then(setProfileRows)
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, [period]);
  useEffect(() => {
    api(`devices/hourly?date=${dayDate}`)
      .then(setDayRows)
      .catch(() => {});
  }, [dayDate]);

  const shiftDay = (n) => {
    const d = new Date(dayDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    const next = localDate(d);
    if (next <= localDate()) setDayDate(next);
  };

  const statsById = useMemo(() => new Map(devStats.map((s) => [s.id, s])), [devStats]);

  const t = chartTheme();
  const axes = baseAxes(t);

  // couleur stable par appareil (ordre d'identifiant, jamais par rang)
  const colorOf = useMemo(() => {
    const ids = [...allDevices].sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.id);
    return (id) => t.series[ids.indexOf(id) % 8];
  }, [allDevices, t.series[0]]);

  const donutOption = useMemo(() => {
    if (!data) return null;
    const slices = data.devices
      .filter((d) => d.kwh > 0.001)
      .map((d) => ({
        name: d.name,
        value: +d.kwh.toFixed(2),
        itemStyle: { color: colorOf(d.id), borderColor: t.surface, borderWidth: 2 },
      }));
    if (data.resteKwh != null && data.resteKwh > 0.001) {
      slices.push({
        name: 'Reste maison (non mesuré)',
        value: +data.resteKwh.toFixed(2),
        itemStyle: { color: t.neutral, borderColor: t.surface, borderWidth: 2 },
      });
    }
    const total = slices.reduce((s, x) => s + x.value, 0);
    return {
      ...axes,
      tooltip: {
        ...axes.tooltip,
        formatter: (p) =>
          `<b>${p.name}</b><br/>${fmtKwh(p.value)} · ${((p.value / total) * 100).toFixed(1)} %`,
      },
      legend: { ...axes.legend, orient: 'vertical', right: 0, top: 'middle' },
      series: [
        {
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['36%', '50%'],
          label: {
            color: t.ink2,
            fontSize: 11,
            formatter: (p) =>
              p.percent >= 4 ? `${p.name.replace(/ \(.*\)$/, '')}\n${p.percent.toFixed(0)} %` : '',
          },
          labelLine: { lineStyle: { color: t.axis } },
          data: slices,
        },
      ],
    };
  }, [data, colorOf]);

  const rankOption = useMemo(() => {
    if (!data) return null;
    const rows = [...data.devices].sort((a, b) => a.kwh - b.kwh);
    return {
      ...axes,
      grid: { left: 130, right: 70, top: 10, bottom: 28 },
      tooltip: {
        ...axes.tooltip,
        formatter: (p) =>
          `<b>${p.name}</b><br/>${fmtKwh(p.value)} · ${fmtEur(rows[p.dataIndex].eur)}`,
      },
      xAxis: { ...axes.xAxis, type: 'value', name: 'kWh', nameTextStyle: { color: t.muted } },
      yAxis: {
        ...axes.yAxis,
        type: 'category',
        data: rows.map((d) => d.name),
        axisLabel: { color: t.ink2, fontSize: 12 },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 20,
          data: rows.map((d) => ({
            name: d.name,
            value: +d.kwh.toFixed(2),
            itemStyle: { color: colorOf(d.id), borderRadius: [0, 4, 4, 0] },
          })),
          label: {
            show: true,
            position: 'right',
            color: t.ink2,
            fontSize: 11,
            formatter: (p) => fmtEur(rows[p.dataIndex].eur),
          },
        },
      ],
    };
  }, [data, colorOf]);

  // historique quotidien empilé : une couleur stable par prise, segments séparés de 2 px
  const historyOption = useMemo(() => {
    if (historyRows.length === 0) return null;
    const dates = [...new Set(historyRows.map((r) => r.date))].sort();
    const ids = [...new Set(historyRows.map((r) => r.id))];
    const names = new Map(historyRows.map((r) => [r.id, r.name]));
    const byDev = new Map(ids.map((id) => [id, new Map()]));
    for (const r of historyRows) byDev.get(r.id).set(r.date, r.kwh);
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 34, bottom: 30 },
      legend: { ...axes.legend, top: 0 },
      tooltip: {
        ...axes.tooltip,
        trigger: 'axis',
        formatter: (params) => {
          const rows = params.filter((p) => p.value != null && p.value > 0);
          if (!rows.length) return '';
          const total = rows.reduce((s, p) => s + p.value, 0);
          return (
            `<b>${params[0].axisValue}</b><br/>` +
            rows.map((p) => `${p.marker} ${p.seriesName} : ${fmtKwh(p.value)}`).join('<br/>') +
            `<br/><b>Total prises : ${fmtKwh(total)}</b>`
          );
        },
      },
      xAxis: {
        ...axes.xAxis,
        type: 'category',
        data: dates,
        axisLabel: { ...axes.xAxis.axisLabel, rotate: dates.length > 14 ? 45 : 0 },
      },
      yAxis: { ...axes.yAxis, type: 'value', name: 'kWh', nameTextStyle: { color: t.muted } },
      series: ids.map((id) => ({
        name: names.get(id),
        type: 'bar',
        stack: 'prises',
        barMaxWidth: 26,
        itemStyle: { color: colorOf(id), borderColor: t.surface, borderWidth: 2 },
        data: dates.map((d) => {
          const v = byDev.get(id).get(d);
          return v != null && v > 0.0005 ? +v.toFixed(3) : null;
        }),
      })),
    };
  }, [historyRows, colorOf]);

  // journée type : énergie horaire moyenne par prise (empilée, 0h → 23h)
  const profileOption = useMemo(() => {
    if (profileRows.length === 0) return null;
    const ids = [...new Set(profileRows.map((r) => r.id))];
    const names = new Map(profileRows.map((r) => [r.id, r.name]));
    const byDev = new Map(ids.map((id) => [id, new Array(24).fill(null)]));
    for (const r of profileRows) byDev.get(r.id)[r.hour] = r.avg_wh;
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 34, bottom: 30 },
      legend: { ...axes.legend, top: 0 },
      tooltip: {
        ...axes.tooltip,
        trigger: 'axis',
        formatter: (params) => {
          const rows = params.filter((p) => p.value != null && p.value > 0.5);
          if (!rows.length) return '';
          const total = rows.reduce((s, p) => s + p.value, 0);
          return (
            `<b>${params[0].axisValue}</b><br/>` +
            rows
              .map((p) => `${p.marker} ${p.seriesName} : ${Math.round(p.value)} Wh`)
              .join('<br/>') +
            `<br/><b>Total : ${Math.round(total)} Wh</b>`
          );
        },
      },
      xAxis: {
        ...axes.xAxis,
        type: 'category',
        data: Array.from({ length: 24 }, (_, h) => `${h}h`),
      },
      yAxis: { ...axes.yAxis, type: 'value', name: 'Wh / h', nameTextStyle: { color: t.muted } },
      series: ids.map((id) => ({
        name: names.get(id),
        type: 'bar',
        stack: 'profil',
        barMaxWidth: 26,
        itemStyle: { color: colorOf(id), borderColor: t.surface, borderWidth: 2 },
        data: byDev.get(id).map((v) => (v != null && v > 0.5 ? Math.round(v) : null)),
      })),
    };
  }, [profileRows, colorOf]);

  // détail heure par heure d'une journée précise (navigable jour par jour)
  const dayOption = useMemo(() => {
    if (dayRows.length === 0) return null;
    const ids = [...new Set(dayRows.map((r) => r.id))];
    const names = new Map(dayRows.map((r) => [r.id, r.name]));
    const byDev = new Map(ids.map((id) => [id, new Array(24).fill(null)]));
    for (const r of dayRows) byDev.get(r.id)[r.hour] = r.wh;
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 34, bottom: 30 },
      legend: { ...axes.legend, top: 0 },
      tooltip: {
        ...axes.tooltip,
        trigger: 'axis',
        formatter: (params) => {
          const rows = params.filter((p) => p.value != null && p.value > 0.5);
          if (!rows.length) return '';
          const total = rows.reduce((s, p) => s + p.value, 0);
          return (
            `<b>${params[0].axisValue}</b><br/>` +
            rows
              .map((p) => `${p.marker} ${p.seriesName} : ${Math.round(p.value)} Wh`)
              .join('<br/>') +
            `<br/><b>Total : ${Math.round(total)} Wh</b>`
          );
        },
      },
      xAxis: {
        ...axes.xAxis,
        type: 'category',
        data: Array.from({ length: 24 }, (_, h) => `${h}h`),
      },
      yAxis: { ...axes.yAxis, type: 'value', name: 'Wh', nameTextStyle: { color: t.muted } },
      series: ids.map((id) => ({
        name: names.get(id),
        type: 'bar',
        stack: 'jour',
        barMaxWidth: 26,
        itemStyle: { color: colorOf(id), borderColor: t.surface, borderWidth: 2 },
        data: byDev.get(id).map((v) => (v != null && v > 0.5 ? Math.round(v) : null)),
      })),
    };
  }, [dayRows, colorOf]);

  const saveDevice = async (id) => {
    const patch = edit[id];
    if (!patch) return;
    await post(`devices/${id}`, patch).catch(() => {});
    setEdit((e) => {
      const n = { ...e };
      delete n[id];
      return n;
    });
    load();
  };

  const measured = data ? data.devices : [];

  return (
    <>
      <div className="filters">
        {PERIODS.map(([v, label]) => (
          <button key={v} className={period === v ? 'active' : ''} onClick={() => setPeriod(v)}>
            {label}
          </button>
        ))}
      </div>

      {data && measured.length === 0 && (
        <div className="empty">
          Aucune énergie mesurée par les prises sur cette période.
          <br />
          Vérifiez le statut « Prises » en haut de page, ou activez le mode démo dans les Réglages.
        </div>
      )}

      {data && measured.length > 0 && (
        <>
          <div className="cards">
            <div className="card">
              <div className="label">Mesuré par les prises</div>
              <div className="value">{fmtKwh(data.plugsKwh)}</div>
              <div className="sub">{measured.length} appareil(s)</div>
            </div>
            <div className="card">
              <div className="label">Total maison (Linky)</div>
              <div className="value">{fmtKwh(data.linkyKwh > 0 ? data.linkyKwh : null)}</div>
              <div className="sub">
                {data.linkyKwh > 0 ? '' : 'pas encore de données Linky sur la période'}
              </div>
            </div>
            <div className="card">
              <div className="label">Reste (non mesuré)</div>
              <div className="value">{fmtKwh(data.resteKwh)}</div>
              <div className="sub">
                {data.resteEur != null ? fmtEur(data.resteEur) : 'nécessite les données Linky'}
              </div>
            </div>
            <div className="card">
              <div className="label">Couverture des prises</div>
              <div className="value">
                {data.linkyKwh > 0 && data.plugsOnHouseKwh > 0
                  ? ((data.plugsOnHouseKwh / data.linkyKwh) * 100).toFixed(0)
                  : '—'}{' '}
                <small>%</small>
              </div>
              <div className="sub">
                part de la conso maison mesurée en détail (jours comparables)
              </div>
            </div>
          </div>

          {data.unmeteredNote && (
            <p className="note" style={{ marginTop: -6, marginBottom: 16 }}>
              <b>Reste non mesuré :</b> {data.unmeteredNote}
            </p>
          )}

          <div className="grid2">
            <div className="panel">
              <h2>Répartition</h2>
              <Chart option={donutOption} height={300} />
            </div>
            <div className="panel">
              <h2>
                Classement <span className="hint">coût sur la période</span>
              </h2>
              <Chart option={rankOption} height={300} />
            </div>
          </div>

          <div className="panel">
            <h2>
              Historique quotidien{' '}
              <span className="hint">kWh mesurés par chaque prise, jour par jour</span>
            </h2>
            {historyOption ? (
              <Chart option={historyOption} height={280} />
            ) : (
              <div className="empty">
                Pas encore d'historique quotidien — il se remplit automatiquement chaque jour.
              </div>
            )}
          </div>

          <div className="panel">
            <h2>
              Journée type{' '}
              <span className="hint">
                énergie moyenne par heure de la journée, sur la période choisie
              </span>
            </h2>
            {profileOption ? (
              <Chart option={profileOption} height={280} />
            ) : (
              <div className="empty">Pas encore assez de données horaires.</div>
            )}
          </div>

          <div className="panel">
            <h2>
              Détail jour par jour{' '}
              <span className="hint">la même vue, mais pour une date précise</span>
            </h2>
            <div className="filters">
              <button onClick={() => shiftDay(-1)}>← Jour précédent</button>
              <input
                type="date"
                value={dayDate}
                max={localDate()}
                onChange={(e) => e.target.value && setDayDate(e.target.value)}
              />
              <button onClick={() => shiftDay(1)} disabled={dayDate >= localDate()}>
                Jour suivant →
              </button>
              {dayDate !== localDate() && (
                <button onClick={() => setDayDate(localDate())}>Aujourd'hui</button>
              )}
            </div>
            {dayOption ? (
              <Chart option={dayOption} height={280} />
            ) : (
              <div className="empty">Aucune donnée horaire pour cette date.</div>
            )}
          </div>

          <div className="panel">
            <h2>
              Usage et veilles{' '}
              <span className="hint">
                temps allumé (&gt; 2 W), veille moyenne, pic observé, projection annuelle
              </span>
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Appareil</th>
                    <th className="num">Temps allumé / j</th>
                    <th className="num">Veille moy.</th>
                    <th className="num">Pic</th>
                    <th className="num">Moy. / jour</th>
                    <th className="num">Est. annuelle</th>
                  </tr>
                </thead>
                <tbody>
                  {measured.map((d) => {
                    const s = statsById.get(d.id);
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className="swatch" style={{ background: colorOf(d.id) }} />
                          {d.name}
                        </td>
                        <td className="num">
                          {s?.onHoursPerDay != null
                            ? `${Math.floor(s.onHoursPerDay)} h ${String(Math.round((s.onHoursPerDay % 1) * 60)).padStart(2, '0')}`
                            : '—'}
                        </td>
                        <td className="num">
                          {s?.standbyW != null ? `${s.standbyW.toFixed(1)} W` : '—'}
                        </td>
                        <td
                          className="num"
                          title={s?.peakTs ? new Date(s.peakTs).toLocaleString('fr-FR') : ''}
                        >
                          {s?.peakW != null ? `${Math.round(s.peakW)} W` : '—'}
                        </td>
                        <td className="num">{s?.avgDayKwh != null ? fmtKwh(s.avgDayKwh) : '—'}</td>
                        <td className="num">
                          {s?.estYearKwh != null
                            ? `${Math.round(s.estYearKwh)} kWh · ${fmtEur(s.estYearEur)}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              La projection annuelle extrapole la moyenne de la période choisie — plus la période
              est longue, plus elle est fiable.
            </p>
          </div>

          <div className="panel">
            <h2>
              Détail <span className="hint">touchez un nom ou une pièce pour renommer</span>
            </h2>
            <div className="table-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Appareil</th>
                    <th>Pièce</th>
                    <th className="num">kWh</th>
                    <th className="num">Coût</th>
                    <th className="num">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {measured.map((d) => (
                    <tr key={d.id}>
                      <td style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="swatch" style={{ background: colorOf(d.id) }} />
                        <input
                          defaultValue={d.name}
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              [d.id]: { ...prev[d.id], name: e.target.value },
                            }))
                          }
                          onBlur={() => saveDevice(d.id)}
                        />
                      </td>
                      <td>
                        <input
                          defaultValue={d.room || ''}
                          placeholder="—"
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              [d.id]: { ...prev[d.id], room: e.target.value },
                            }))
                          }
                          onBlur={() => saveDevice(d.id)}
                        />
                      </td>
                      <td className="num">{d.kwh.toFixed(2)}</td>
                      <td className="num">{fmtEur(d.eur)}</td>
                      <td className="num">{(d.share * 100).toFixed(1)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
