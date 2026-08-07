import { useState } from 'react';
import { post } from '../api.js';

const defaults = {
  linky_enabled: true,
  ewelink_enabled: false,
  omajin_enabled: false,
  prm: '',
  conso_token: '',
  ewelink_email: '',
  ewelink_password: '',
  ewelink_region: 'eu',
  tuya_access_id: '',
  tuya_access_secret: '',
  tuya_region: 'eu',
  tuya_device_ids: '',
  supplier_name: 'EDF',
  offer_name: 'Tarif Bleu',
  tariff_type: 'base',
  price_kwh: '0.2016',
  price_hp: '0.2146',
  price_hc: '0.1696',
  offpeak_share: '0.40',
  tempo_blue_hp: '0.1609',
  tempo_blue_hc: '0.1296',
  tempo_white_hp: '0.1894',
  tempo_white_hc: '0.1486',
  tempo_red_hp: '0.7562',
  tempo_red_hc: '0.1568',
  ejp_normal: '0.1758',
  ejp_peak: '1.5197',
  subscription_month: '13.09',
  kva: '6',
};

function Toggle({ checked, onChange, children }) {
  return (
    <label className="choice-card">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export default function Onboarding({ tariffs, onReady }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(defaults);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));

  const finish = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await post('setup/complete', form);
      setToken(result.accessToken);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-brand">
          <img src="/brand/wattelier-mark.svg" alt="" />
          <span>Wattelier</span>
        </div>
        <div className="eyebrow">Configuration initiale · étape {step}/3</div>
        {step === 1 && (
          <>
            <h1>Bienvenue dans Wattelier</h1>
            <p>
              Choisissez uniquement les sources que vous utilisez. Vous pourrez les modifier plus
              tard dans les réglages.
            </p>
            <div className="choice-grid">
              <Toggle
                checked={form.linky_enabled}
                onChange={(value) => setForm((v) => ({ ...v, linky_enabled: value }))}
              >
                <b>Compteur Linky · Conso API</b>
                <small>Consommation globale du logement et historique Enedis.</small>
              </Toggle>
              <Toggle
                checked={form.ewelink_enabled}
                onChange={(value) => setForm((v) => ({ ...v, ewelink_enabled: value }))}
              >
                <b>Prises Sonoff · eWeLink</b>
                <small>Puissance en temps réel et détail par appareil.</small>
              </Toggle>
              <Toggle
                checked={form.omajin_enabled}
                onChange={(value) => setForm((v) => ({ ...v, omajin_enabled: value }))}
              >
                <b>Prises Omajin · Tuya</b>
                <small>OSP-FR-01 : puissance, consommation et marche/arrêt.</small>
              </Toggle>
            </div>
            {form.linky_enabled && (
              <div className="settings onboarding-fields">
                <label>
                  PRM / PDL (14 chiffres)
                  <input value={form.prm} onChange={set('prm')} inputMode="numeric" />
                </label>
                <label>
                  Token Conso API
                  <input type="password" value={form.conso_token} onChange={set('conso_token')} />
                </label>
              </div>
            )}
            {form.ewelink_enabled && (
              <div className="settings onboarding-fields">
                <label>
                  E-mail eWeLink
                  <input type="email" value={form.ewelink_email} onChange={set('ewelink_email')} />
                </label>
                <label>
                  Mot de passe eWeLink
                  <input
                    type="password"
                    value={form.ewelink_password}
                    onChange={set('ewelink_password')}
                  />
                </label>
                <label>
                  Région
                  <select value={form.ewelink_region} onChange={set('ewelink_region')}>
                    <option value="eu">Europe</option>
                    <option value="us">Amériques</option>
                    <option value="as">Asie</option>
                    <option value="cn">Chine</option>
                  </select>
                </label>
              </div>
            )}
            {form.omajin_enabled && (
              <div className="settings onboarding-fields">
                <label>
                  Access ID Tuya
                  <input value={form.tuya_access_id} onChange={set('tuya_access_id')} />
                </label>
                <label>
                  Access Secret Tuya
                  <input
                    type="password"
                    value={form.tuya_access_secret}
                    onChange={set('tuya_access_secret')}
                  />
                </label>
                <label>
                  Centre de données
                  <select value={form.tuya_region} onChange={set('tuya_region')}>
                    <option value="eu">Europe centrale (France)</option>
                    <option value="eu-west">Europe occidentale</option>
                    <option value="us">Amérique occidentale</option>
                    <option value="us-east">Amérique orientale</option>
                    <option value="cn">Chine</option>
                    <option value="in">Inde</option>
                    <option value="sg">Singapour</option>
                  </select>
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  Identifiant de la prise Tuya
                  <input
                    value={form.tuya_device_ids}
                    onChange={set('tuya_device_ids')}
                    placeholder="bf1234567890abcdef"
                  />
                </label>
              </div>
            )}
            <div className="onboarding-actions">
              <button className="btn" onClick={() => setStep(2)}>
                Continuer
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Votre contrat d’électricité</h1>
            <p>Les prix restent modifiables : recopiez les montants TTC de votre contrat.</p>
            <div className="settings onboarding-fields">
              <label>
                Fournisseur
                <input value={form.supplier_name} onChange={set('supplier_name')} />
              </label>
              <label>
                Nom de l’offre
                <input value={form.offer_name} onChange={set('offer_name')} />
              </label>
              <label>
                Option tarifaire
                <select value={form.tariff_type} onChange={set('tariff_type')}>
                  {(tariffs || []).map((tariff) => (
                    <option key={tariff.id} value={tariff.id}>
                      {tariff.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Abonnement mensuel TTC (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subscription_month}
                  onChange={set('subscription_month')}
                />
              </label>
              <label>
                Puissance souscrite (kVA)
                <input type="number" min="3" max="36" value={form.kva} onChange={set('kva')} />
              </label>
              {(form.tariff_type === 'base' || form.tariff_type === 'custom') && (
                <label>
                  Prix du kWh TTC (€)
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={form.price_kwh}
                    onChange={set('price_kwh')}
                  />
                </label>
              )}
              {form.tariff_type === 'hphc' && (
                <>
                  <label>
                    Prix HP TTC (€ / kWh)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.price_hp}
                      onChange={set('price_hp')}
                    />
                  </label>
                  <label>
                    Prix HC TTC (€ / kWh)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.price_hc}
                      onChange={set('price_hc')}
                    />
                  </label>
                </>
              )}
              {form.tariff_type === 'tempo' &&
                [
                  ['tempo_blue_hp', 'Bleu · HP'],
                  ['tempo_blue_hc', 'Bleu · HC'],
                  ['tempo_white_hp', 'Blanc · HP'],
                  ['tempo_white_hc', 'Blanc · HC'],
                  ['tempo_red_hp', 'Rouge · HP'],
                  ['tempo_red_hc', 'Rouge · HC'],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label} (€ / kWh)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form[key]}
                      onChange={set(key)}
                    />
                  </label>
                ))}
              {form.tariff_type === 'ejp' && (
                <>
                  <label>
                    Prix jour normal (€ / kWh)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.ejp_normal}
                      onChange={set('ejp_normal')}
                    />
                  </label>
                  <label>
                    Prix jour de pointe (€ / kWh)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.ejp_peak}
                      onChange={set('ejp_peak')}
                    />
                  </label>
                </>
              )}
              {['hphc', 'tempo'].includes(form.tariff_type) && (
                <label>
                  Part estimée en heures creuses (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={Math.round(Number(form.offpeak_share) * 100)}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        offpeak_share: String(Number(event.target.value) / 100),
                      }))
                    }
                  />
                </label>
              )}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="onboarding-actions">
              <button className="btn secondary" onClick={() => setStep(1)}>
                Retour
              </button>
              <button className="btn" onClick={finish} disabled={saving}>
                {saving ? 'Configuration…' : 'Terminer la configuration'}
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Conservez votre jeton d’accès</h1>
            <p>
              Il protège toutes les données du serveur et sera demandé une seule fois dans l’app
              mobile. Il ne pourra plus être affiché après cette page.
            </p>
            <div className="token-box">
              <code>{token}</code>
              <button
                className="btn secondary"
                onClick={() => navigator.clipboard?.writeText(token)}
              >
                Copier
              </button>
            </div>
            <p className="warning-note">
              Pour un accès depuis Internet, placez le serveur derrière HTTPS ou un VPN. N’ouvrez
              jamais directement le port HTTP sur votre box.
            </p>
            <div className="onboarding-actions">
              <button className="btn" onClick={onReady}>
                Ouvrir Wattelier
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export function ServerLogin({ onReady }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await post('auth/session', { token });
      onReady();
    } catch {
      setError('Jeton incorrect. Vérifiez la valeur enregistrée lors de l’installation.');
    }
  };
  return (
    <main className="onboarding-shell">
      <form className="onboarding-card" onSubmit={submit}>
        <div className="onboarding-brand">
          <img src="/brand/wattelier-mark.svg" alt="" />
          <span>Wattelier</span>
        </div>
        <div className="eyebrow">Connexion au serveur Wattelier</div>
        <h1>Connexion sécurisée</h1>
        <p>Saisissez une fois le jeton fourni par votre serveur.</p>
        <label>
          Jeton d’accès
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="onboarding-actions">
          <button className="btn" type="submit">
            Se connecter
          </button>
        </div>
      </form>
    </main>
  );
}
