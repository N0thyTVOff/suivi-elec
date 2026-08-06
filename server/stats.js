import { db, getSetting } from './db.js';
import { tariffSettings } from './tariffs.js';

/** Toutes les agrégations servies au dashboard. Montants en €, énergies en kWh. */

function prices() {
  const tariff = tariffSettings();
  return {
    kwh: tariff.averageKwhRate,
    subMonth: tariff.subscriptionMonth,
    kva: tariff.kva,
    tariff,
  };
}

function demoOn() {
  return getSetting('demo_mode') === '1';
}
/** Filtre SQL : en mode démo on inclut tout, sinon le réel + les relevés manuels. */
function srcFilter(alias = '') {
  const col = alias ? `${alias}.source` : 'source';
  return demoOn() ? '1=1' : `${col} IN ('real', 'manual')`;
}

/**
 * Énergie quotidienne par prise : la valeur rapportée par la prise elle-même
 * (dayKwh / historique eWeLink, complète même PC éteint) est prioritaire sur
 * la somme de nos agrégats horaires.
 */
function plugDailySql() {
  const src = srcFilter();
  return `
    SELECT device_id, date, wh FROM (
      SELECT device_id, date, wh,
             ROW_NUMBER() OVER (PARTITION BY device_id, date ORDER BY pri DESC) AS rn
      FROM (
        SELECT device_id, date, wh, 1 AS pri FROM plug_energy_daily WHERE ${src}
        UNION ALL
        SELECT device_id, date(hour_start/1000, 'unixepoch', 'localtime') AS date, SUM(wh) AS wh, 0 AS pri
        FROM plug_energy_hourly WHERE ${src}
        GROUP BY device_id, date(hour_start/1000, 'unixepoch', 'localtime')
      )
    ) WHERE rn = 1`;
}

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Série quotidienne à DEUX colonnes distinctes — jamais additionnées entre elles :
 * - `houseKwh` : consommation totale du logement (Linky, ou relevé manuel d'index) ;
 * - `plugsKwh` : sous-ensemble mesuré par les prises (inclus dans houseKwh).
 */
export function dailySeries(days = 400) {
  const p = prices();
  const linky = db
    .prepare(
      `
    SELECT date, wh, source FROM linky_daily WHERE ${srcFilter()}
    ORDER BY date DESC LIMIT ?
  `,
    )
    .all(days);
  const plugs = db
    .prepare(
      `
    SELECT date, SUM(wh) AS wh FROM (${plugDailySql()})
    GROUP BY date ORDER BY date DESC LIMIT ?
  `,
    )
    .all(days);

  const map = new Map();
  const row = (date) => {
    let r = map.get(date);
    if (!r) {
      r = { date, houseKwh: null, houseFrom: null, plugsKwh: null };
      map.set(date, r);
    }
    return r;
  };
  for (const r of plugs) row(r.date).plugsKwh = r.wh / 1000;
  for (const r of linky) {
    const x = row(r.date);
    x.houseKwh = r.wh / 1000;
    x.houseFrom = r.source === 'manual' ? 'manuel' : 'linky';
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      ...r,
      houseEur: r.houseKwh != null ? r.houseKwh * p.kwh : null,
      plugsEur: r.plugsKwh != null ? r.plugsKwh * p.kwh : null,
    }));
}

/** Énergie quotidienne PAR prise (pour l'historique par appareil). */
export function devicesDaily(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT p.date, p.device_id AS id, d.name, p.wh / 1000.0 AS kwh
    FROM (${plugDailySql()}) p
    JOIN devices d ON d.id = p.device_id
    WHERE p.date BETWEEN ? AND ?
    ORDER BY p.date
  `,
    )
    .all(startDate, endDate);
}

/**
 * Statistiques d'usage par prise sur [start, end] : temps de fonctionnement,
 * consommation de veille, pic de puissance, extrapolation annuelle.
 * Basées sur les relevés bruts (conservés ~30 j) et les agrégats quotidiens.
 */
export function deviceStats(startDate, endDate) {
  const p = prices();
  const startTs = new Date(startDate + 'T00:00:00').getTime();
  const endTs = new Date(endDate + 'T23:59:59').getTime();
  const devices = db
    .prepare(`SELECT id, name, room FROM devices WHERE ${srcFilter()} ORDER BY name`)
    .all();

  return devices.map((d) => {
    const counts = db
      .prepare(
        `
      SELECT COUNT(*) AS n, SUM(watts > 2) AS nOn FROM plug_readings
      WHERE device_id = ? AND ${srcFilter()} AND ts BETWEEN ? AND ?
    `,
      )
      .get(d.id, startTs, endTs);
    // veille : puissance moyenne quand l'appareil tire un filet de courant (0,3–25 W)
    const standby = db
      .prepare(
        `
      SELECT AVG(watts) AS w, COUNT(*) AS n FROM plug_readings
      WHERE device_id = ? AND ${srcFilter()} AND ts BETWEEN ? AND ? AND watts BETWEEN 0.3 AND 25
    `,
      )
      .get(d.id, startTs, endTs);
    const peak = db
      .prepare(
        `
      SELECT watts, ts FROM plug_readings
      WHERE device_id = ? AND ${srcFilter()} AND ts BETWEEN ? AND ?
      ORDER BY watts DESC LIMIT 1
    `,
      )
      .get(d.id, startTs, endTs);
    const daily = db
      .prepare(
        `
      SELECT COUNT(*) AS days, SUM(wh) AS wh FROM (${plugDailySql()})
      WHERE device_id = ? AND date BETWEEN ? AND ?
    `,
      )
      .get(d.id, startDate, endDate);

    const avgDayKwh = daily.days ? daily.wh / 1000 / daily.days : null;
    return {
      id: d.id,
      name: d.name,
      room: d.room,
      onHoursPerDay: counts.n ? (counts.nOn / counts.n) * 24 : null,
      standbyW: standby.n >= 5 ? standby.w : null,
      peakW: peak?.watts ?? null,
      peakTs: peak?.ts ?? null,
      kwh: daily.wh ? daily.wh / 1000 : 0,
      avgDayKwh,
      estYearKwh: avgDayKwh != null ? avgDayKwh * 365 : null,
      estYearEur: avgDayKwh != null ? avgDayKwh * 365 * p.kwh : null,
    };
  });
}

/** Détail horaire d'une journée précise : Wh par prise et par heure. */
export function devicesHourly(date) {
  return db
    .prepare(
      `
    SELECT e.device_id AS id, d.name,
           CAST(strftime('%H', e.hour_start/1000, 'unixepoch', 'localtime') AS INT) AS hour,
           e.wh
    FROM plug_energy_hourly e
    JOIN devices d ON d.id = e.device_id
    WHERE ${srcFilter('e')}
      AND date(e.hour_start/1000, 'unixepoch', 'localtime') = ?
    ORDER BY hour
  `,
    )
    .all(date);
}

/** Journée type : énergie horaire moyenne (Wh) par prise et par heure de la journée. */
export function hourlyProfile(startDate, endDate) {
  return db
    .prepare(
      `
    SELECT e.device_id AS id, d.name,
           CAST(strftime('%H', e.hour_start/1000, 'unixepoch', 'localtime') AS INT) AS hour,
           AVG(e.wh) AS avg_wh
    FROM plug_energy_hourly e
    JOIN devices d ON d.id = e.device_id
    WHERE ${srcFilter('e')}
      AND date(e.hour_start/1000, 'unixepoch', 'localtime') BETWEEN ? AND ?
    GROUP BY e.device_id, hour
    ORDER BY hour
  `,
    )
    .all(startDate, endDate);
}

/** Relevés bruts récents (amorce du graphique temps réel au chargement de la page). */
export function recentReadings(minutes = 30) {
  const cutoff = Date.now() - minutes * 60_000;
  return db
    .prepare(
      `
    SELECT r.device_id AS deviceId, d.name, r.ts, r.watts, r.volts, r.amps
    FROM plug_readings r
    JOIN devices d ON d.id = r.device_id
    WHERE ${srcFilter('r')} AND r.ts > ?
    ORDER BY r.ts
  `,
    )
    .all(cutoff);
}

/** Courbe de charge d'un jour donné : Linky (30 min) + total prises (par heure). */
export function dayDetail(date) {
  const linky = db
    .prepare(
      `
    SELECT ts, watts, interval_min FROM linky_load_curve
    WHERE ${srcFilter()} AND date(ts/1000, 'unixepoch', 'localtime') = ?
    ORDER BY ts
  `,
    )
    .all(date);
  const plugs = db
    .prepare(
      `
    SELECT hour_start AS ts, SUM(wh) AS wh
    FROM plug_energy_hourly
    WHERE ${srcFilter()} AND date(hour_start/1000, 'unixepoch', 'localtime') = ?
    GROUP BY hour_start ORDER BY hour_start
  `,
    )
    .all(date);
  return { linky, plugs };
}

/** Répartition par appareil sur [start, end] (dates locales incluses). */
export function deviceBreakdown(startDate, endDate) {
  const p = prices();
  const rows = db
    .prepare(
      `
    SELECT p.device_id, d.name, d.room, SUM(p.wh) AS wh
    FROM (${plugDailySql()}) p
    JOIN devices d ON d.id = p.device_id
    WHERE p.date BETWEEN ? AND ?
    GROUP BY p.device_id ORDER BY wh DESC
  `,
    )
    .all(startDate, endDate);

  const linkyTotal =
    db
      .prepare(
        `
    SELECT SUM(wh) AS wh FROM linky_daily
    WHERE ${srcFilter()} AND date BETWEEN ? AND ?
  `,
      )
      .get(startDate, endDate)?.wh || 0;

  const plugsTotal = rows.reduce((s, r) => s + r.wh, 0);
  // le « reste maison » ne se calcule que sur les jours où les DEUX mesures existent
  const plugsOnHouseDays =
    db
      .prepare(
        `
    SELECT SUM(p.wh) AS wh FROM (${plugDailySql()}) p
    WHERE p.date BETWEEN ? AND ?
      AND p.date IN (SELECT date FROM linky_daily WHERE ${srcFilter()})
  `,
      )
      .get(startDate, endDate)?.wh || 0;
  const rest =
    plugsOnHouseDays > 0 && linkyTotal > plugsOnHouseDays ? linkyTotal - plugsOnHouseDays : null;

  // base des parts : le total maison seulement si les jours sont comparables,
  // sinon le total des prises (les parts somment alors à 100 %)
  const shareBase = plugsOnHouseDays > 0 && linkyTotal > 0 ? linkyTotal : plugsTotal;
  return {
    devices: rows.map((r) => ({
      id: r.device_id,
      name: r.name,
      room: r.room,
      kwh: r.wh / 1000,
      eur: (r.wh / 1000) * p.kwh,
      share: shareBase > 0 ? r.wh / shareBase : 0,
    })),
    resteKwh: rest !== null ? rest / 1000 : null,
    resteEur: rest !== null ? (rest / 1000) * p.kwh : null,
    linkyKwh: linkyTotal / 1000,
    plugsKwh: plugsTotal / 1000,
    plugsOnHouseKwh: plugsOnHouseDays / 1000,
    unmeteredNote: getSetting('unmetered_note') || '',
  };
}

/** Heatmap heure × jour de semaine (Wh moyens par heure) sur N derniers jours. */
export function heatmap(days = 56) {
  // Priorité à la courbe de charge Linky (plus complète), sinon prises
  const linky = db
    .prepare(
      `
    SELECT CAST(strftime('%w', ts/1000, 'unixepoch', 'localtime') AS INT) AS dow,
           CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INT) AS hour,
           AVG(watts) AS avg_w, COUNT(*) AS n
    FROM linky_load_curve
    WHERE ${srcFilter()} AND ts > (strftime('%s','now') - ${days} * 86400) * 1000
    GROUP BY dow, hour
  `,
    )
    .all();
  if (linky.length > 0) return { unit: 'W', cells: linky, from: 'linky' };

  const plugs = db
    .prepare(
      `
    SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', 'localtime') AS INT) AS dow,
           CAST(strftime('%H', hour_start/1000, 'unixepoch', 'localtime') AS INT) AS hour,
           AVG(wh) AS avg_w, COUNT(*) AS n
    FROM plug_energy_hourly
    WHERE ${srcFilter()} AND hour_start > (strftime('%s','now') - ${days} * 86400) * 1000
    GROUP BY dow, hour
  `,
    )
    .all();
  return { unit: 'Wh', cells: plugs, from: 'prises' };
}

/** Stats avancées : talon, records, projections. */
export function advanced() {
  const p = prices();
  const today = localDate();
  const monthStart = today.slice(0, 8) + '01';

  // Talon nocturne : puissance moyenne 02h-06h sur 30 jours (courbe de charge)
  const talon =
    db
      .prepare(
        `
    SELECT AVG(watts) AS w FROM linky_load_curve
    WHERE ${srcFilter()}
      AND CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INT) BETWEEN 2 AND 5
      AND ts > (strftime('%s','now') - 30 * 86400) * 1000
  `,
      )
      .get()?.w ?? null;

  // Records journaliers
  const maxDay =
    db
      .prepare(
        `
    SELECT date, wh FROM linky_daily WHERE ${srcFilter()} ORDER BY wh DESC LIMIT 1`,
      )
      .get() || null;
  const minDay =
    db
      .prepare(
        `
    SELECT date, wh FROM linky_daily WHERE ${srcFilter()} AND wh > 0 ORDER BY wh ASC LIMIT 1`,
      )
      .get() || null;
  const peak =
    db
      .prepare(
        `
    SELECT date, va, ts FROM linky_max_power WHERE ${srcFilter()} ORDER BY va DESC LIMIT 1`,
      )
      .get() || null;

  // Base des calculs : jours « maison » (Linky/relevé manuel) uniquement ; si aucun,
  // repli sur les prises seules — mais on ne mélange JAMAIS les deux dans une somme.
  const series = dailySeries(70);
  const houseDays = series
    .filter((r) => r.houseKwh != null)
    .map((r) => ({ date: r.date, kwh: r.houseKwh }));
  const plugDays = series
    .filter((r) => r.plugsKwh != null)
    .map((r) => ({ date: r.date, kwh: r.plugsKwh }));
  const base = houseDays.length ? houseDays : plugDays;
  const baseFrom = houseDays.length ? 'maison' : 'prises';

  const monthRows = base.filter((r) => r.date >= monthStart && r.date <= today);
  const monthKwh = monthRows.reduce((s, r) => s + r.kwh, 0);
  const daysMeasured = monthRows.filter((r) => r.date < today).length || monthRows.length;
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projMonthKwh = daysMeasured > 0 ? (monthKwh / daysMeasured) * daysInMonth : 0;

  // Moyenne des 30 derniers jours mesurés (aujourd'hui, partiel, exclu) → projection annuelle
  const last30 = base.filter((r) => r.date < today).slice(-30);
  const avgDayKwh = last30.length ? last30.reduce((s, r) => s + r.kwh, 0) / last30.length : 0;
  const projYearKwh = avgDayKwh * 365;
  const dayOfMonth = new Date().getDate();

  // Veilles cumulées des prises (14 derniers jours de relevés bruts)
  const standbyRows = db
    .prepare(
      `
    SELECT device_id, AVG(watts) AS w, COUNT(*) AS n FROM plug_readings
    WHERE ${srcFilter()} AND watts BETWEEN 0.3 AND 25
      AND ts > (strftime('%s','now') - 14 * 86400) * 1000
    GROUP BY device_id HAVING n >= 5
  `,
    )
    .all();
  const plugsStandbyW = standbyRows.length ? standbyRows.reduce((s, r) => s + r.w, 0) : null;

  // Part nocturne (22h-6h) de l'énergie mesurée par les prises (14 derniers jours)
  const night = db
    .prepare(
      `
    SELECT SUM(CASE WHEN CAST(strftime('%H', hour_start/1000,'unixepoch','localtime') AS INT) >= 22
                      OR CAST(strftime('%H', hour_start/1000,'unixepoch','localtime') AS INT) < 6
               THEN wh ELSE 0 END) AS nwh,
           SUM(wh) AS twh
    FROM plug_energy_hourly
    WHERE ${srcFilter()} AND hour_start > (strftime('%s','now') - 14 * 86400) * 1000
  `,
    )
    .get();
  const nightSharePct = night?.twh > 0 ? (night.nwh / night.twh) * 100 : null;

  // Week-end vs semaine (moyenne/jour sur la série de base, jours complets uniquement)
  const completeDays = base.filter((r) => r.date < today);
  const weekend = completeDays.filter((r) =>
    [0, 6].includes(new Date(r.date + 'T12:00:00').getDay()),
  );
  const weekdays = completeDays.filter(
    (r) => ![0, 6].includes(new Date(r.date + 'T12:00:00').getDay()),
  );
  const weekendAvgKwh = weekend.length
    ? weekend.reduce((s, r) => s + r.kwh, 0) / weekend.length
    : null;
  const weekdayAvgKwh = weekdays.length
    ? weekdays.reduce((s, r) => s + r.kwh, 0) / weekdays.length
    : null;
  const weekendDeltaPct =
    weekendAvgKwh != null && weekdayAvgKwh > 0
      ? ((weekendAvgKwh - weekdayAvgKwh) / weekdayAvgKwh) * 100
      : null;

  // Semaine type : moyenne par jour de la semaine (0 = dimanche … 6 = samedi)
  const dowAgg = new Map();
  for (const r of completeDays) {
    const dow = new Date(r.date + 'T12:00:00').getDay();
    const c = dowAgg.get(dow) || { sum: 0, n: 0 };
    c.sum += r.kwh;
    c.n++;
    dowAgg.set(dow, c);
  }
  const weekdayProfile = Array.from({ length: 7 }, (_, dow) => {
    const c = dowAgg.get(dow);
    return { dow, avgKwh: c ? c.sum / c.n : null, n: c ? c.n : 0 };
  });

  // Prise la plus gourmande sur 30 jours
  const topDevice =
    db
      .prepare(
        `
    SELECT d.name, SUM(p.wh) / 1000.0 AS kwh
    FROM (${plugDailySql()}) p JOIN devices d ON d.id = p.device_id
    WHERE p.date >= ?
    GROUP BY p.device_id ORDER BY kwh DESC LIMIT 1
  `,
      )
      .get(localDate(new Date(Date.now() - 30 * 86400_000))) || null;

  return {
    talonW: talon,
    talonCostYear: talon !== null ? (talon / 1000) * 24 * 365 * p.kwh : null,
    plugsStandbyW,
    plugsStandbyCostYear: plugsStandbyW != null ? (plugsStandbyW / 1000) * 24 * 365 * p.kwh : null,
    nightSharePct,
    weekendAvgKwh,
    weekdayAvgKwh,
    weekendDeltaPct,
    weekdayProfile,
    topDevice,
    maxDay: maxDay
      ? { date: maxDay.date, kwh: maxDay.wh / 1000, eur: (maxDay.wh / 1000) * p.kwh }
      : null,
    minDay: minDay ? { date: minDay.date, kwh: minDay.wh / 1000 } : null,
    peak: peak ? { date: peak.date, va: peak.va, kvaSouscrite: p.kva } : null,
    monthKwh,
    monthEur: monthKwh * p.kwh + p.subMonth * (dayOfMonth / daysInMonth),
    projMonthKwh,
    projMonthEur: projMonthKwh * p.kwh + p.subMonth,
    avgDayKwh,
    avgDayEur: avgDayKwh * p.kwh,
    projYearKwh,
    projYearEur: projYearKwh * p.kwh + p.subMonth * 12,
    baseFrom, // 'maison' (Linky/relevé) ou 'prises' si aucune donnée maison
    prices: p,
  };
}

/**
 * Suivi de la mensualisation : compare ce qui a été VERSÉ (échéances fixes)
 * à ce qui a été réellement CONSOMMÉ, et projette la facture de régularisation.
 *
 * La consommation n'étant mesurée que sur une partie de la période (compteur
 * récent, trous éventuels), le coût réel est extrapolé à partir de la moyenne
 * des jours effectivement mesurés — `daysMeasured` indique la fiabilité.
 */
export function billing() {
  const p = prices();
  const start = getSetting('billing_start');
  const end = getSetting('billing_end');
  const today = localDate();

  const installments = db.prepare('SELECT date, amount FROM installments ORDER BY date').all();
  const paidToDate = installments.filter((i) => i.date <= today).reduce((s, i) => s + i.amount, 0);
  const plannedTotal = installments.reduce((s, i) => s + i.amount, 0);

  const dayMs = 86400_000;
  const d0 = new Date(start + 'T12:00:00');
  const d1 = new Date(end + 'T12:00:00');
  const dToday = new Date(today + 'T12:00:00');
  const totalDays = Math.max(1, Math.round((d1 - d0) / dayMs) + 1);
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((dToday - d0) / dayMs) + 1));

  // consommation réellement mesurée sur la période (maison uniquement)
  const measured = dailySeries(800).filter(
    (r) => r.date >= start && r.date <= today && r.houseKwh != null,
  );
  const daysMeasured = measured.length;
  const kwhMeasured = measured.reduce((s, r) => s + r.houseKwh, 0);
  const avgDayKwh = daysMeasured > 0 ? kwhMeasured / daysMeasured : null;

  const subPerDay = (p.subMonth * 12) / 365;

  let consoCostToDate = null,
    subCostToDate = null,
    realCostToDate = null,
    balance = null;
  let projectedTotal = null,
    projectedRegul = null,
    projectedYearKwh = null;
  if (avgDayKwh !== null) {
    consoCostToDate = avgDayKwh * elapsedDays * p.kwh; // extrapolé sur les jours non mesurés
    subCostToDate = subPerDay * elapsedDays;
    realCostToDate = consoCostToDate + subCostToDate;
    balance = paidToDate - realCostToDate; // > 0 : avance ; < 0 : retard
    projectedYearKwh = avgDayKwh * totalDays;
    projectedTotal = projectedYearKwh * p.kwh + subPerDay * totalDays;
    projectedRegul = projectedTotal - plannedTotal; // > 0 : à payer ; < 0 : remboursement
  }

  // mensualité « juste » qui annulerait la régularisation
  const idealMonthly =
    projectedTotal !== null && installments.length > 0
      ? projectedTotal / installments.length
      : null;

  return {
    start,
    end,
    today,
    totalDays,
    elapsedDays,
    daysMeasured,
    coveragePct: elapsedDays > 0 ? (daysMeasured / elapsedDays) * 100 : 0,
    installments,
    paidToDate,
    plannedTotal,
    nextInstallment: installments.find((i) => i.date > today) || null,
    avgDayKwh,
    kwhMeasured,
    consoCostToDate,
    subCostToDate,
    realCostToDate,
    balance,
    projectedYearKwh,
    projectedTotal,
    projectedRegul,
    idealMonthly,
    prices: p,
  };
}

/** Résumé pour l'en-tête du dashboard. */
export function summary() {
  const p = prices();
  const today = localDate();
  const yesterday = localDate(new Date(Date.now() - 86400_000));

  const series = dailySeries(10);
  const yRow = series.find((r) => r.date === yesterday);
  const tRow = series.find((r) => r.date === today);

  // puissance instantanée : dernier relevé (< 2,5 min — cadence cloud incluse) de chaque prise
  const lastPerDevice = db
    .prepare(
      `
    SELECT r.device_id, d.name, r.watts, r.volts, r.amps, r.ts, d.online, d.switch_state
    FROM plug_readings r
    JOIN devices d ON d.id = r.device_id
    WHERE ${srcFilter('r')} AND r.ts = (
      SELECT MAX(ts) FROM plug_readings r2 WHERE r2.device_id = r.device_id
    )
  `,
    )
    .all();
  const nowW = lastPerDevice
    .filter((r) => Date.now() - r.ts < 150_000)
    .reduce((s, r) => s + r.watts, 0);

  // kWh du jour par prise (compteur de la prise, sinon somme horaire)
  const todayByDevice = new Map(
    db
      .prepare(`SELECT device_id, wh FROM (${plugDailySql()}) WHERE date = ?`)
      .all(today)
      .map((r) => [r.device_id, r.wh / 1000]),
  );
  for (const d of lastPerDevice) d.todayKwh = todayByDevice.get(d.device_id) ?? 0;

  // maison (Linky/relevé manuel) et prises : deux mesures distinctes, jamais additionnées
  return {
    nowW,
    devices: lastPerDevice,
    todayPlugsKwh: tRow?.plugsKwh ?? 0,
    todayHouseKwh: tRow?.houseKwh ?? null,
    yesterdayPlugsKwh: yRow?.plugsKwh ?? null,
    yesterdayHouseKwh: yRow?.houseKwh ?? null,
    yesterdayHouseFrom: yRow?.houseFrom ?? null,
    prices: p,
  };
}
