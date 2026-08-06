import { getSetting } from './db.js';

const TYPES = new Set(['base', 'hphc', 'tempo', 'ejp', 'custom']);

function numberSetting(key, fallback = 0) {
  const value = Number(getSetting(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function boundedShare(key, fallback) {
  return Math.min(1, Math.max(0, numberSetting(key, fallback)));
}

export function tariffSettings() {
  const requested = getSetting('tariff_type') || 'base';
  const type = TYPES.has(requested) ? requested : 'custom';
  const offpeakShare = boundedShare('offpeak_share', 0.4);
  const rates = {
    base: numberSetting('price_kwh', 0.2016),
    hp: numberSetting('price_hp', 0.2146),
    hc: numberSetting('price_hc', 0.1696),
    tempoBlueHp: numberSetting('tempo_blue_hp', 0.1609),
    tempoBlueHc: numberSetting('tempo_blue_hc', 0.1296),
    tempoWhiteHp: numberSetting('tempo_white_hp', 0.1894),
    tempoWhiteHc: numberSetting('tempo_white_hc', 0.1486),
    tempoRedHp: numberSetting('tempo_red_hp', 0.7562),
    tempoRedHc: numberSetting('tempo_red_hc', 0.1568),
    ejpNormal: numberSetting('ejp_normal', 0.1758),
    ejpPeak: numberSetting('ejp_peak', 1.5197),
  };

  const hpShare = 1 - offpeakShare;
  const dayRate = (hp, hc) => hp * hpShare + hc * offpeakShare;
  let averageKwhRate = rates.base;
  if (type === 'hphc') averageKwhRate = dayRate(rates.hp, rates.hc);
  if (type === 'tempo') {
    // Répartition réglementaire Tempo : 300 jours bleus, 43 blancs et 22 rouges.
    averageKwhRate =
      (300 * dayRate(rates.tempoBlueHp, rates.tempoBlueHc) +
        43 * dayRate(rates.tempoWhiteHp, rates.tempoWhiteHc) +
        22 * dayRate(rates.tempoRedHp, rates.tempoRedHc)) /
      365;
  }
  if (type === 'ejp') averageKwhRate = (343 * rates.ejpNormal + 22 * rates.ejpPeak) / 365;

  return {
    type,
    supplier: getSetting('supplier_name') || '',
    offer: getSetting('offer_name') || '',
    subscriptionMonth: numberSetting('subscription_month', 0),
    kva: numberSetting('kva', 6) || 6,
    offpeakShare,
    averageKwhRate,
    rates,
    estimated: type !== 'base' && type !== 'custom',
  };
}

export function supportedTariffs() {
  return [
    { id: 'base', label: 'Base' },
    { id: 'hphc', label: 'Heures pleines / heures creuses' },
    { id: 'tempo', label: 'Tempo' },
    { id: 'ejp', label: 'EJP' },
    { id: 'custom', label: 'Offre personnalisée / prix fixe' },
  ];
}
