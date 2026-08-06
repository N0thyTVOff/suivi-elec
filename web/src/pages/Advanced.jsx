import { useEffect, useMemo, useState } from 'react';
import Chart from '../Chart.jsx';
import { api, fmtKwh, fmtEur, fmtW, fmtDate } from '../api.js';
import { chartTheme, baseAxes } from '../theme.js';

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
// strftime('%w') : 0 = dimanche … 6 = samedi → index dans DAY_LABELS
const DOW_TO_ROW = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

export default function Advanced() {
  const [adv, setAdv] = useState(null);
  const [hm, setHm] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api('advanced')
      .then(setAdv)
      .catch(() => {});
    api('heatmap?days=56')
      .then(setHm)
      .catch(() => {});
    api('settings')
      .then(setSettings)
      .catch(() => {});
  }, []);

  const t = chartTheme();
  const axes = baseAxes(t);

  const heatOption = useMemo(() => {
    if (!hm || hm.cells.length === 0) return null;
    const values = hm.cells.map((c) => [c.hour, DOW_TO_ROW[c.dow], Math.round(c.avg_w)]);
    const max = Math.max(...values.map((v) => v[2]));
    return {
      ...axes,
      grid: { left: 46, right: 16, top: 10, bottom: 70 },
      tooltip: {
        ...axes.tooltip,
        formatter: (p) =>
          `<b>${DAY_LABELS[p.value[1]]} ${String(p.value[0]).padStart(2, '0')}h</b><br/>${p.value[2]} ${hm.unit} en moyenne`,
      },
      xAxis: {
        ...axes.xAxis,
        type: 'category',
        data: Array.from({ length: 24 }, (_, h) => `${h}h`),
        splitArea: { show: false },
      },
      yAxis: {
        ...axes.yAxis,
        type: 'category',
        data: DAY_LABELS,
        splitLine: { show: false },
      },
      visualMap: {
        min: 0,
        max,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 6,
        inRange: { color: t.seq },
        textStyle: { color: t.muted, fontSize: 11 },
        formatter: (v) => `${Math.round(v)} ${hm.unit}`,
      },
      series: [
        {
          type: 'heatmap',
          data: values,
          itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
          emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1 } },
        },
      ],
    };
  }, [hm, t.seq[0]]);

  const weekOption = useMemo(() => {
    if (!adv?.weekdayProfile) return null;
    const order = [1, 2, 3, 4, 5, 6, 0]; // Lun → Dim
    const vals = order.map((dow) => adv.weekdayProfile.find((r) => r.dow === dow));
    if (!vals.some((v) => v && v.avgKwh != null)) return null;
    return {
      ...axes,
      grid: { left: 52, right: 16, top: 16, bottom: 28 },
      tooltip: {
        ...axes.tooltip,
        formatter: (p) => {
          const v = vals[p.dataIndex];
          return v?.avgKwh != null
            ? `<b>${DAY_LABELS[p.dataIndex]}</b><br/>${fmtKwh(v.avgKwh)} en moyenne · ${v.n} jour(s) mesurés`
            : '';
        },
      },
      xAxis: { ...axes.xAxis, type: 'category', data: DAY_LABELS },
      yAxis: { ...axes.yAxis, type: 'value', name: 'kWh', nameTextStyle: { color: t.muted } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 40,
          itemStyle: { color: t.series[0], borderRadius: [4, 4, 0, 0] },
          data: vals.map((v) => (v?.avgKwh != null ? +v.avgKwh.toFixed(2) : null)),
        },
      ],
    };
  }, [adv, t.series[0]]);

  if (!adv) return <div className="empty">Chargement…</div>;

  const peakPct = adv.peak ? (adv.peak.va / (adv.peak.kvaSouscrite * 1000)) * 100 : null;
  const budget = Number(settings?.budget_month_eur) || 0;
  const budgetPct = budget > 0 ? Math.min((adv.monthEur / budget) * 100, 100) : null;
  const budgetProjOver = budget > 0 && adv.projMonthEur > budget;

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Talon nocturne (veilles, frigo…)</div>
          <div className="value">{adv.talonW != null ? fmtW(adv.talonW) : '—'}</div>
          <div className="sub">
            {adv.talonCostYear != null
              ? `≈ ${fmtEur(adv.talonCostYear)} par an si constant`
              : 'nécessite la courbe de charge Linky'}
          </div>
        </div>
        <div className="card">
          <div className="label">Pic de puissance</div>
          <div className="value">
            {adv.peak ? `${(adv.peak.va / 1000).toFixed(1)} ` : '—'}
            {adv.peak && <small>kVA</small>}
          </div>
          <div className="sub">
            {adv.peak && (
              <span className={peakPct > 90 ? 'delta-up' : ''}>
                {peakPct.toFixed(0)} % des {adv.peak.kvaSouscrite} kVA souscrits · le{' '}
                {fmtDate(adv.peak.date)}
              </span>
            )}
          </div>
        </div>
        <div className="card">
          <div className="label">Jour record</div>
          <div className="value">{adv.maxDay ? fmtKwh(adv.maxDay.kwh) : '—'}</div>
          <div className="sub">
            {adv.maxDay ? `${fmtEur(adv.maxDay.eur)} · le ${fmtDate(adv.maxDay.date)}` : ''}
          </div>
        </div>
        <div className="card">
          <div className="label">Jour le plus sobre</div>
          <div className="value">{adv.minDay ? fmtKwh(adv.minDay.kwh) : '—'}</div>
          <div className="sub">{adv.minDay ? `le ${fmtDate(adv.minDay.date)}` : ''}</div>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Moyenne quotidienne (30 j)</div>
          <div className="value">{fmtKwh(adv.avgDayKwh)}</div>
          <div className="sub">
            {fmtEur(adv.avgDayEur)} / jour · base :{' '}
            {adv.baseFrom === 'prises'
              ? 'prises uniquement (en attendant le Linky)'
              : 'maison (Linky/relevé)'}
          </div>
        </div>
        <div className="card">
          <div className="label">Mois en cours</div>
          <div className="value">{fmtKwh(adv.monthKwh)}</div>
          <div className="sub">{fmtEur(adv.monthEur)} abonnement inclus (prorata)</div>
        </div>
        <div className="card">
          <div className="label">Projection fin de mois</div>
          <div className="value">{fmtEur(adv.projMonthEur)}</div>
          <div className="sub">{fmtKwh(adv.projMonthKwh)} + abonnement</div>
        </div>
        <div className="card">
          <div className="label">Projection annuelle</div>
          <div className="value">{fmtEur(adv.projYearEur)}</div>
          <div className="sub">{fmtKwh(adv.projYearKwh)} · au rythme des 30 derniers jours</div>
        </div>
        {budget > 0 && (
          <div className="card">
            <div className="label">Budget mensuel : {fmtEur(budget)}</div>
            <div className="value">
              <span className={budgetProjOver ? 'delta-up' : ''}>
                {budgetPct.toFixed(0)} <small>%</small>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--grid)', marginTop: 8 }}>
              <div
                style={{
                  height: 6,
                  borderRadius: 4,
                  width: `${budgetPct}%`,
                  background: budgetProjOver
                    ? 'var(--crit)'
                    : budgetPct > 75
                      ? 'var(--warn)'
                      : 'var(--ok)',
                }}
              />
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              {budgetProjOver
                ? `projection ${fmtEur(adv.projMonthEur)} — dépassement prévu`
                : `projection ${fmtEur(adv.projMonthEur)} — dans le budget`}
            </div>
          </div>
        )}
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Veilles cumulées des prises</div>
          <div className="value">{adv.plugsStandbyW != null ? fmtW(adv.plugsStandbyW) : '—'}</div>
          <div className="sub">
            {adv.plugsStandbyCostYear != null
              ? `≈ ${fmtEur(adv.plugsStandbyCostYear)} / an si permanent`
              : 'calculé après quelques jours de relevés'}
          </div>
        </div>
        <div className="card">
          <div className="label">Part nocturne (22 h - 6 h)</div>
          <div className="value">
            {adv.nightSharePct != null ? `${adv.nightSharePct.toFixed(0)} ` : '—'}
            {adv.nightSharePct != null && <small>%</small>}
          </div>
          <div className="sub">de l'énergie mesurée par les prises (14 j)</div>
        </div>
        <div className="card">
          <div className="label">Week-end vs semaine</div>
          <div className="value">
            {adv.weekendDeltaPct == null ? (
              '—'
            ) : (
              <span className={adv.weekendDeltaPct > 0 ? 'delta-up' : 'delta-down'}>
                {adv.weekendDeltaPct > 0 ? '▲' : '▼'} {Math.abs(adv.weekendDeltaPct).toFixed(0)}{' '}
                <small>%</small>
              </span>
            )}
          </div>
          <div className="sub">
            {adv.weekendDeltaPct != null
              ? `${fmtKwh(adv.weekendAvgKwh)}/j le week-end vs ${fmtKwh(adv.weekdayAvgKwh)}/j en semaine`
              : 'il faut au moins un jour de chaque type'}
          </div>
        </div>
        <div className="card">
          <div className="label">Prise la plus gourmande (30 j)</div>
          <div className="value" style={{ fontSize: 20 }}>
            {adv.topDevice ? adv.topDevice.name : '—'}
          </div>
          <div className="sub">{adv.topDevice ? fmtKwh(adv.topDevice.kwh) : ''}</div>
        </div>
      </div>

      <div className="panel">
        <h2>
          Semaine type <span className="hint">consommation moyenne par jour de la semaine</span>
        </h2>
        {weekOption ? (
          <Chart option={weekOption} height={240} />
        ) : (
          <div className="empty">
            Encore trop peu de jours mesurés — le profil se dessinera au fil des semaines.
          </div>
        )}
      </div>

      <div className="panel">
        <h2>
          Heatmap heure × jour
          <span className="hint">
            {hm?.from === 'linky'
              ? 'puissance moyenne (Linky, 8 dernières semaines)'
              : 'énergie horaire moyenne des prises (8 dernières semaines)'}
          </span>
        </h2>
        {heatOption ? (
          <Chart option={heatOption} height={320} />
        ) : (
          <div className="empty">
            Pas encore assez de données pour la heatmap.
            <br />
            Elle se remplira avec la courbe de charge Linky (ou le mode démo).
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Tarif appliqué</h2>
        <p className="note">
          {adv.prices.tariff?.supplier || 'Fournisseur'} ·{' '}
          {adv.prices.tariff?.offer || adv.prices.tariff?.type} :{' '}
          <b>
            {Number(adv.prices.kwh).toLocaleString('fr-FR', { minimumFractionDigits: 4 })} € / kWh
          </b>{' '}
          · abonnement <b>{fmtEur(adv.prices.subMonth)}</b> / mois · <b>{adv.prices.kva} kVA</b> —
          modifiable dans les Réglages.
          {adv.prices.tariff?.estimated &&
            ' Le prix moyen est estimé selon la répartition configurée des plages tarifaires.'}
        </p>
      </div>
    </>
  );
}
