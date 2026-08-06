import { useEffect, useState } from 'react';
import { api, post, fmtKwh, fmtEur, fmtDate, localDate } from '../api.js';

export default function Billing() {
  const [b, setB] = useState(null);
  const [formDate, setFormDate] = useState(localDate());
  const [formAmount, setFormAmount] = useState('');
  const [period, setPeriod] = useState({ start: '', end: '' });
  const [saved, setSaved] = useState(false);

  const load = () =>
    api('billing')
      .then((data) => {
        setB(data);
        setPeriod({ start: data.start, end: data.end });
      })
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const addInstallment = async () => {
    const amt = Number(formAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    const data = await post('installments', { date: formDate, amount: amt }).catch(() => null);
    if (data) {
      setB(data);
      setFormAmount('');
    }
  };
  const removeInstallment = async (date) => {
    const data = await api(`installments/${date}`, { method: 'DELETE' }).catch(() => null);
    if (data) setB(data);
  };
  const savePeriod = async () => {
    await post('settings', { billing_start: period.start, billing_end: period.end }).catch(
      () => {},
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    load();
  };

  if (!b) return <div className="empty">Chargement…</div>;

  const enoughData = b.avgDayKwh != null;
  // solde > 0 : vous avez payé plus que consommé (avance) ; < 0 : vous êtes en retard
  const avance = b.balance != null && b.balance >= 0;
  const regulAPayer = b.projectedRegul != null && b.projectedRegul > 0;

  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="label">Versé à ce jour</div>
          <div className="value">{fmtEur(b.paidToDate)}</div>
          <div className="sub">
            {b.installments.filter((i) => i.date <= b.today).length} échéance(s) sur{' '}
            {b.installments.length}
            {b.nextInstallment && ` · prochaine le ${fmtDate(b.nextInstallment.date)}`}
          </div>
        </div>
        <div className="card">
          <div className="label">Consommé à ce jour</div>
          <div className="value">{enoughData ? fmtEur(b.realCostToDate) : '—'}</div>
          <div className="sub">
            {enoughData
              ? `dont ${fmtEur(b.subCostToDate)} d'abonnement · ${b.elapsedDays} j écoulés`
              : 'en attente de données de consommation'}
          </div>
        </div>
        <div className="card">
          <div className="label">{avance ? 'Avance (trop-perçu)' : 'Retard (à rattraper)'}</div>
          <div className="value">
            {b.balance == null ? (
              '—'
            ) : (
              <span className={avance ? 'delta-down' : 'delta-up'}>
                {avance ? '+' : '−'} {fmtEur(Math.abs(b.balance))}
              </span>
            )}
          </div>
          <div className="sub">
            {b.balance == null
              ? ''
              : avance
                ? 'vos mensualités couvrent plus que votre conso'
                : 'votre conso dépasse ce que vous avez versé'}
          </div>
        </div>
        <div className="card">
          <div className="label">Régularisation prévue</div>
          <div className="value">
            {b.projectedRegul == null ? (
              '—'
            ) : (
              <span className={regulAPayer ? 'delta-up' : 'delta-down'}>
                {regulAPayer ? '' : '− '}
                {fmtEur(Math.abs(b.projectedRegul))}
              </span>
            )}
          </div>
          <div className="sub">
            {b.projectedRegul == null
              ? 'en attente de données'
              : regulAPayer
                ? 'à payer en fin de contrat'
                : 'remboursement estimé'}
          </div>
        </div>
      </div>

      {enoughData && b.coveragePct < 60 && (
        <div className="panel" style={{ borderLeft: '3px solid var(--warn)' }}>
          <p className="note" style={{ margin: 0 }}>
            <b>Estimation encore peu fiable.</b> Seulement <b>{b.daysMeasured} jour(s)</b> de
            consommation réellement mesurés sur les {b.elapsedDays} jours écoulés (
            {b.coveragePct.toFixed(0)} % de couverture). Le reste est extrapolé à partir de cette
            moyenne. Les chiffres se fiabiliseront dès que les données Enedis arriveront et au fil
            des semaines.
          </p>
        </div>
      )}

      <div className="panel">
        <h2>
          Bilan de la période{' '}
          <span className="hint">
            du {fmtDate(b.start)} au {fmtDate(b.end)} — {b.totalDays} jours
          </span>
        </h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Total des mensualités prévues</td>
              <td className="num">{fmtEur(b.plannedTotal)}</td>
            </tr>
            <tr>
              <td>Coût réel projeté sur la période</td>
              <td className="num">{b.projectedTotal != null ? fmtEur(b.projectedTotal) : '—'}</td>
            </tr>
            <tr>
              <td>
                <b>Écart = régularisation</b>
              </td>
              <td className="num">
                <b className={regulAPayer ? 'delta-up' : 'delta-down'}>
                  {b.projectedRegul == null
                    ? '—'
                    : regulAPayer
                      ? `+ ${fmtEur(b.projectedRegul)}`
                      : `− ${fmtEur(Math.abs(b.projectedRegul))}`}
                </b>
              </td>
            </tr>
            <tr>
              <td>Consommation projetée</td>
              <td className="num">
                {b.projectedYearKwh != null ? fmtKwh(b.projectedYearKwh) : '—'}
              </td>
            </tr>
            <tr>
              <td>Moyenne mesurée</td>
              <td className="num">{b.avgDayKwh != null ? `${fmtKwh(b.avgDayKwh)} / jour` : '—'}</td>
            </tr>
            <tr>
              <td>Mensualité « juste » (pour une régul à zéro)</td>
              <td className="num">
                {b.idealMonthly != null ? <b>{fmtEur(b.idealMonthly)}</b> : '—'}
              </td>
            </tr>
          </tbody>
        </table>
        {b.idealMonthly != null && (
          <p className="note" style={{ marginTop: 10 }}>
            {regulAPayer ? (
              <>
                Au rythme actuel, vos 35 € mensuels sont <b>insuffisants</b> : une mensualité
                d'environ <b>{fmtEur(b.idealMonthly)}</b> éviterait la régularisation. Vous pouvez
                demander cet ajustement à votre fournisseur depuis votre espace client.
              </>
            ) : (
              <>
                Au rythme actuel, vos mensualités sont <b>supérieures</b> à votre consommation :
                vous devriez être remboursé. Une mensualité d'environ{' '}
                <b>{fmtEur(b.idealMonthly)}</b> serait plus juste.
              </>
            )}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>
          Échéancier <span className="hint">vos prélèvements mensuels (hors régularisation)</span>
        </h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="date"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--page)',
              color: 'var(--ink)',
              borderRadius: 8,
              padding: '8px 10px',
            }}
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Montant (€)"
            style={{
              border: '1px solid var(--border)',
              background: 'var(--page)',
              color: 'var(--ink)',
              borderRadius: 8,
              padding: '8px 10px',
              width: 150,
            }}
            value={formAmount}
            onChange={(e) => setFormAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addInstallment();
            }}
          />
          <button className="btn" onClick={addInstallment} disabled={!formAmount}>
            Ajouter
          </button>
        </div>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Montant</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.installments.map((i) => (
                <tr key={i.date}>
                  <td>{fmtDate(i.date)}</td>
                  <td className="num">{fmtEur(i.amount)}</td>
                  <td style={{ color: i.date <= b.today ? 'var(--good-text)' : 'var(--muted)' }}>
                    {i.date <= b.today ? '✓ prélevée' : 'à venir'}
                  </td>
                  <td className="num">
                    <button
                      className="btn secondary"
                      style={{ padding: '3px 10px' }}
                      onClick={() => removeInstallment(i.date)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {b.installments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: 'var(--muted)' }}>
                    Aucune échéance enregistrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Période de régularisation</h2>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            savePeriod();
          }}
        >
          <label>
            Début de la période
            <input
              type="date"
              value={period.start}
              onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
            />
          </label>
          <label>
            Fin de la période
            <input
              type="date"
              value={period.end}
              onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
            />
          </label>
        </form>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={savePeriod}>
            Enregistrer la période
          </button>
          {saved && <span style={{ color: 'var(--good-text)', fontSize: 13 }}>✓ Enregistré</span>}
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Ces deux dates délimitent l'année de contrat couverte par votre échéancier : c'est sur
          cette période que la régularisation est calculée. Ajustez-les si elles ne correspondent
          pas à votre contrat.
        </p>
      </div>
    </>
  );
}
