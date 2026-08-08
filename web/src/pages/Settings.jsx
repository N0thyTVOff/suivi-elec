import { useEffect, useState } from 'react';
import { api, post } from '../api.js';

export default function Settings({ status }) {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newServerToken, setNewServerToken] = useState('');
  const [desktopInfo, setDesktopInfo] = useState(null);
  const [openAtLoginBusy, setOpenAtLoginBusy] = useState(false);
  const [openAtLoginMessage, setOpenAtLoginMessage] = useState('');
  const [openAtLoginError, setOpenAtLoginError] = useState('');
  const [tailscale, setTailscale] = useState(null);
  const [tailscaleBusy, setTailscaleBusy] = useState(false);
  const [tailscaleError, setTailscaleError] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    api('settings')
      .then(setSettings)
      .catch(() => {});
    window.wattelierDesktop
      ?.getRuntimeInfo()
      .then((info) => {
        setDesktopInfo(info);
        if (info.applicationMode === 'server') {
          window.wattelierDesktop
            ?.getTailscaleStatus?.()
            .then(setTailscale)
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  if (!settings) return <div className="empty">Chargement…</div>;
  const tailscaleEnabled =
    tailscale?.connected && settings.public_server_url === tailscale.serverUrl;

  const set = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const next = await post('settings', settings);
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const toggleDemo = async () => {
    const next = await post('settings', {
      ...settings,
      demo_mode: settings.demo_mode === '1' ? '0' : '1',
    });
    setSettings(next);
  };

  const clearConsoToken = async () => {
    const next = await post('settings', { clear_conso_token: true });
    setSettings(next);
  };

  const toggleConnector = async (key) => {
    const next = await post('settings', { [key]: settings[key] === '1' ? '0' : '1' });
    setSettings(next);
  };

  const rotateServerToken = async () => {
    await post('settings', { public_server_url: settings.public_server_url });
    const result = await post('auth/rotate', {});
    setNewServerToken(result.connectionToken || result.accessToken);
  };

  const enableTailscale = async () => {
    setTailscaleBusy(true);
    setTailscaleError('');
    try {
      const result = await window.wattelierDesktop.enableTailscale();
      if (result.needsApproval) {
        setTailscale(result);
        setTailscaleError(
          'Autorisez Tailscale Serve dans la page qui vient de s’ouvrir, puis cliquez à nouveau sur le bouton.',
        );
        return;
      }
      const next = await post('settings', { public_server_url: result.serverUrl });
      setSettings(next);
      setTailscale(result);
      setNewServerToken('');
    } catch (error) {
      setTailscaleError(error.message || 'Configuration Tailscale impossible.');
    } finally {
      setTailscaleBusy(false);
    }
  };

  const toggleOpenAtLogin = async () => {
    if (openAtLoginBusy) return;
    setOpenAtLoginBusy(true);
    setOpenAtLoginMessage('');
    setOpenAtLoginError('');
    try {
      const result = await window.wattelierDesktop.setOpenAtLogin(!desktopInfo.openAtLogin);
      setDesktopInfo((current) => ({ ...current, ...result }));
      setOpenAtLoginMessage(
        result.openAtLogin ? 'Démarrage avec Windows activé.' : 'Démarrage avec Windows désactivé.',
      );
    } catch (error) {
      setOpenAtLoginError(error.message || 'Windows n’a pas pu modifier le démarrage automatique.');
    } finally {
      setOpenAtLoginBusy(false);
    }
  };

  const toggleAutomaticUpdates = async () => {
    const result = await window.wattelierDesktop.setAutomaticUpdates(!desktopInfo.automaticUpdates);
    setDesktopInfo((current) => ({
      ...current,
      automaticUpdates: result.automaticUpdates,
    }));
  };

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateMessage('');
    try {
      const result = await window.wattelierDesktop.checkForUpdates();
      setUpdateMessage(
        result.message ||
          (result.availableVersion
            ? `Wattelier ${result.availableVersion} est disponible.`
            : 'Recherche terminée.'),
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const resetApplication = async () => {
    setResetting(true);
    setResetError('');
    try {
      const result = await window.wattelierDesktop.resetApplication();
      if (!result.reset) setResetting(false);
    } catch (error) {
      setResetError(error.message || 'La réinitialisation a échoué.');
      setResetting(false);
    }
  };

  return (
    <>
      {desktopInfo && (
        <div className="panel">
          <h2>Application Windows</h2>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <b>Wattelier {desktopInfo.version}</b>
              <p className="note" style={{ margin: '4px 0 0' }}>
                {desktopInfo.portable
                  ? 'Version portable · données dans le dossier Wattelier-data à côté du programme.'
                  : 'Version installée · données conservées dans votre profil Windows.'}
              </p>
            </div>
            {!desktopInfo.portable && (
              <button
                className={`toggle toggle-button ${desktopInfo.openAtLogin ? 'on' : ''}`}
                type="button"
                onClick={toggleOpenAtLogin}
                role="switch"
                aria-checked={desktopInfo.openAtLogin}
                disabled={openAtLoginBusy}
                aria-label="Démarrer Wattelier avec Windows"
              >
                <span className="track" />
                <span>{openAtLoginBusy ? 'Modification…' : 'Démarrer avec Windows'}</span>
              </button>
            )}
          </div>
          {openAtLoginMessage && (
            <p className="note" role="status" style={{ marginBottom: 0 }}>
              {openAtLoginMessage}
            </p>
          )}
          {openAtLoginError && (
            <p className="form-error" role="alert" style={{ marginBottom: 0 }}>
              {openAtLoginError}
            </p>
          )}
          {desktopInfo.portable && (
            <p className="note" style={{ marginBottom: 0 }}>
              Le démarrage automatique est désactivé pour préserver le caractère déplaçable de la
              version portable.
            </p>
          )}
          <div className="row" style={{ marginTop: 16, justifyContent: 'space-between' }}>
            <div>
              <b>Mises à jour</b>
              <p className="note" style={{ margin: '4px 0 0' }}>
                Wattelier vérifie les nouvelles versions au démarrage.
                {desktopInfo.portable
                  ? ' Le téléchargement reste manuel en mode portable.'
                  : ' Vous choisissez si leur téléchargement et leur installation sont automatiques.'}
              </p>
            </div>
            {!desktopInfo.portable && (
              <div
                className={`toggle ${desktopInfo.automaticUpdates ? 'on' : ''}`}
                onClick={toggleAutomaticUpdates}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') toggleAutomaticUpdates();
                }}
                role="switch"
                tabIndex="0"
                aria-checked={desktopInfo.automaticUpdates}
                aria-label="Installer automatiquement les mises à jour"
              >
                <span className="track" />
                <span>Mises à jour automatiques</span>
              </div>
            )}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn secondary"
              type="button"
              onClick={checkForUpdates}
              disabled={checkingUpdate}
            >
              {checkingUpdate ? 'Recherche…' : 'Rechercher une mise à jour'}
            </button>
            {updateMessage && <span className="note">{updateMessage}</span>}
          </div>
          {desktopInfo.applicationMode === 'server' && (
            <div className="danger-zone">
              <div>
                <b>Réinitialiser Wattelier</b>
                <p className="note" style={{ margin: '4px 0 0' }}>
                  Redémarre au premier écran et place la base, les réglages et les journaux actuels
                  dans un dossier de sauvegarde récupérable. La configuration Tailscale reste
                  inchangée.
                </p>
              </div>
              <button
                className="btn danger"
                type="button"
                onClick={resetApplication}
                disabled={resetting}
              >
                {resetting ? 'Réinitialisation…' : 'Réinitialiser l’application'}
              </button>
              {resetError && <p className="form-error">{resetError}</p>}
            </div>
          )}
        </div>
      )}

      <div className="panel">
        <h2>Mode démo</h2>
        <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            className={`toggle ${settings.demo_mode === '1' ? 'on' : ''}`}
            onClick={toggleDemo}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') toggleDemo();
            }}
            role="switch"
            tabIndex="0"
            aria-checked={settings.demo_mode === '1'}
          >
            <span className="track" />
            <span>
              {settings.demo_mode === '1' ? 'Activé — données factices affichées' : 'Désactivé'}
            </span>
          </div>
        </div>
        <p className="note" style={{ marginBottom: 0 }}>
          Génère un an de données plausibles (compteur + 4 appareils) pour explorer tous les
          graphiques en attendant les vraies données. La désactivation supprime toutes les données
          de démonstration ; les données réelles ne sont jamais touchées.
        </p>
      </div>

      <div className="panel">
        <h2>Contrat, tarifs et facturation</h2>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            Fournisseur
            <input value={settings.supplier_name} onChange={set('supplier_name')} />
          </label>
          <label>
            Nom de l’offre
            <input value={settings.offer_name} onChange={set('offer_name')} />
          </label>
          <label>
            Option tarifaire
            <select value={settings.tariff_type} onChange={set('tariff_type')}>
              <option value="base">Base</option>
              <option value="hphc">Heures pleines / heures creuses</option>
              <option value="tempo">Tempo</option>
              <option value="ejp">EJP</option>
              <option value="custom">Offre personnalisée / prix fixe</option>
            </select>
          </label>
          {['base', 'custom'].includes(settings.tariff_type) && (
            <label>
              Prix du kWh TTC (€)
              <input
                type="number"
                step="0.0001"
                min="0"
                value={settings.price_kwh}
                onChange={set('price_kwh')}
              />
            </label>
          )}
          {settings.tariff_type === 'hphc' && (
            <>
              <label>
                Prix heures pleines (€ / kWh)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.price_hp}
                  onChange={set('price_hp')}
                />
              </label>
              <label>
                Prix heures creuses (€ / kWh)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.price_hc}
                  onChange={set('price_hc')}
                />
              </label>
            </>
          )}
          {settings.tariff_type === 'tempo' && (
            <>
              {[
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
                    step="0.0001"
                    min="0"
                    value={settings[key]}
                    onChange={set(key)}
                  />
                </label>
              ))}
            </>
          )}
          {settings.tariff_type === 'ejp' && (
            <>
              <label>
                Prix jour normal (€ / kWh)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.ejp_normal}
                  onChange={set('ejp_normal')}
                />
              </label>
              <label>
                Prix jour de pointe (€ / kWh)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={settings.ejp_peak}
                  onChange={set('ejp_peak')}
                />
              </label>
            </>
          )}
          {['hphc', 'tempo'].includes(settings.tariff_type) && (
            <label>
              Part estimée en heures creuses (%)
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={Math.round(Number(settings.offpeak_share) * 100)}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    offpeak_share: String(Number(event.target.value) / 100),
                  }))
                }
              />
            </label>
          )}
          <label>
            Abonnement mensuel TTC (€)
            <input
              type="number"
              step="0.01"
              min="0"
              value={settings.subscription_month}
              onChange={set('subscription_month')}
            />
          </label>
          <label>
            Puissance souscrite (kVA)
            <input
              type="number"
              step="1"
              min="3"
              max="36"
              value={settings.kva}
              onChange={set('kva')}
            />
          </label>
          <label>
            Budget mensuel (€, optionnel)
            <input
              type="number"
              step="1"
              min="0"
              placeholder="ex : 45"
              value={settings.budget_month_eur}
              onChange={set('budget_month_eur')}
            />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Composition du « reste non mesuré »
            <textarea
              value={settings.unmetered_note}
              onChange={set('unmetered_note')}
              placeholder="ex : éclairage, plaque de cuisson… (chauffage/eau chaude collectifs = hors compteur)"
            />
          </label>
        </form>
        <p className="note">
          Reportez les valeurs TTC exactes de votre fournisseur. Les offres Base, HP/HC, Tempo, EJP
          et personnalisées sont prises en charge. Pour les offres variables, la facture est une
          estimation basée sur votre part d’heures creuses et l’historique disponible. Le budget
          mensuel affiche une jauge de suivi et une alerte de dépassement prévisionnel dans les
          Stats avancées. Le « reste non mesuré » (conso maison − prises) est décrit dans l'onglet
          Par appareil : indiquez ce qu'il contient chez vous.
        </p>
      </div>

      <div className="panel">
        <h2>Compteur Linky (Conso API)</h2>
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => toggleConnector('linky_enabled')}
          >
            {settings.linky_enabled === '1' ? '✓ Connecteur activé' : 'Connecteur désactivé'}
          </button>
        </div>
        <form
          className="settings"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label>
            Numéro PRM / PDL (14 chiffres)
            <input value={settings.prm} onChange={set('prm')} placeholder="12345678901234" />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Token Conso API
            <textarea
              value={settings.conso_token}
              onChange={set('conso_token')}
              placeholder={
                settings.conso_token_configured
                  ? 'Token enregistré — saisissez une nouvelle valeur pour le remplacer'
                  : 'xxx.yyy.zzz (collez le token obtenu sur conso.boris.sh)'
              }
            />
          </label>
        </form>
        <p className="note">
          Marche à suivre (2 minutes, dès que le Linky apparaît dans votre espace Enedis) :<br />
          1. Sur{' '}
          <a href="https://mon-compte-particulier.enedis.fr" target="_blank" rel="noreferrer">
            votre espace Enedis
          </a>
          , activez « l'enregistrement et la collecte de la consommation horaire » (menu Gérer
          l'accès à mes données).
          <br />
          2. Sur{' '}
          <a href="https://conso.boris.sh" target="_blank" rel="noreferrer">
            conso.boris.sh
          </a>
          , donnez votre consentement → vous obtenez un token personnel et votre numéro PRM.
          <br />
          3. Collez-les ci-dessus et enregistrez : l'historique se remplit automatiquement (et se
          rattrape à chaque démarrage).
        </p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les réglages'}
          </button>
          {settings.conso_token_configured && (
            <button className="btn" onClick={clearConsoToken} type="button">
              Supprimer le token
            </button>
          )}
          {saved && <span style={{ color: 'var(--good-text)', fontSize: 13 }}>✓ Enregistré</span>}
        </div>
      </div>

      <div className="panel">
        <h2>Prises Sonoff (eWeLink)</h2>
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => toggleConnector('ewelink_enabled')}
          >
            {settings.ewelink_enabled === '1' ? '✓ Connecteur activé' : 'Connecteur désactivé'}
          </button>
        </div>
        <form
          className="settings"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label>
            E-mail eWeLink
            <input
              type="email"
              value={settings.ewelink_email}
              onChange={set('ewelink_email')}
              placeholder={
                settings.ewelink_email_configured
                  ? 'E-mail enregistré — laissez vide pour le conserver'
                  : 'adresse@exemple.fr'
              }
            />
          </label>
          <label>
            Mot de passe eWeLink
            <input
              type="password"
              value={settings.ewelink_password}
              onChange={set('ewelink_password')}
              placeholder={
                settings.ewelink_password_configured
                  ? 'Mot de passe enregistré — laissez vide pour le conserver'
                  : 'Mot de passe du compte eWeLink'
              }
            />
          </label>
          <label>
            Région
            <select value={settings.ewelink_region} onChange={set('ewelink_region')}>
              <option value="eu">Europe</option>
              <option value="us">Amériques</option>
              <option value="as">Asie</option>
              <option value="cn">Chine</option>
            </select>
          </label>
        </form>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={saving}>
            Enregistrer eWeLink
          </button>
        </div>
        <p className="note">
          Les identifiants restent dans la base locale et ne sont jamais renvoyés par l’API. Un
          compte eWeLink dédié est recommandé.
        </p>
      </div>

      <div className="panel">
        <h2>Prises Omajin OSP-FR-01 (Tuya)</h2>
        <div className="row" style={{ marginBottom: 14 }}>
          <button
            className="btn secondary"
            type="button"
            onClick={() => toggleConnector('omajin_enabled')}
          >
            {settings.omajin_enabled === '1' ? '✓ Connecteur activé' : 'Connecteur désactivé'}
          </button>
        </div>
        <form
          className="settings"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label>
            Access ID Tuya
            <input
              type="password"
              value={settings.tuya_access_id}
              onChange={set('tuya_access_id')}
              placeholder={
                settings.tuya_access_id_configured
                  ? 'Access ID enregistré — laissez vide pour le conserver'
                  : 'Access ID du projet Cloud Tuya'
              }
            />
          </label>
          <label>
            Access Secret Tuya
            <input
              type="password"
              value={settings.tuya_access_secret}
              onChange={set('tuya_access_secret')}
              placeholder={
                settings.tuya_access_secret_configured
                  ? 'Secret enregistré — laissez vide pour le conserver'
                  : 'Access Secret du projet Cloud Tuya'
              }
            />
          </label>
          <label>
            Centre de données
            <select value={settings.tuya_region} onChange={set('tuya_region')}>
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
            Appareils Tuya
            <textarea
              value={settings.tuya_device_ids}
              onChange={set('tuya_device_ids')}
              placeholder={'Un identifiant par ligne\nExemple : bf1234567890abcdef=Prise du salon'}
            />
          </label>
        </form>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={saving}>
            Enregistrer Omajin
          </button>
        </div>
        <p className="note">
          L’OSP-FR-01 utilise Tuya Smart Life. Associez la prise à l’application Smart Life, créez
          un projet Cloud sur{' '}
          <a href="https://platform.tuya.com" target="_blank" rel="noreferrer">
            platform.tuya.com
          </a>
          , liez votre compte Smart Life au projet puis recopiez l’Access ID, l’Access Secret et
          l’identifiant de l’appareil. Le numéro de série imprimé sur la prise n’est pas cet
          identifiant. Les secrets restent exclusivement dans la base locale.
        </p>
      </div>

      <div className="panel">
        <h2>État des connexions</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Linky (Conso API)</td>
              <td>
                {settings.linky_enabled !== '1' && 'Désactivé'}
                {settings.linky_enabled === '1' &&
                  !status?.linky?.configured &&
                  'Activé, mais non configuré — renseignez le token ci-dessus'}
                {status?.linky?.configured && status.linky.lastError && (
                  <span style={{ color: 'var(--crit)' }}>Erreur : {status.linky.lastError}</span>
                )}
                {status?.linky?.configured &&
                  !status.linky.lastError &&
                  status.linky.waitingForData &&
                  'Token OK — en attente des premières données Enedis (normal pour un compteur posé récemment, comptez 24-48 h)'}
                {status?.linky?.configured &&
                  !status.linky.lastError &&
                  !status.linky.waitingForData &&
                  `Connecté — ${status.linky.daysInDb} jour(s) d'historique${status.linky.lastSync ? ` · dernière synchro ${new Date(status.linky.lastSync).toLocaleTimeString('fr-FR')}` : ''}`}
              </td>
            </tr>
            <tr>
              <td>Prises Sonoff (eWeLink)</td>
              <td>
                {settings.ewelink_enabled !== '1' && 'Désactivé'}
                {settings.ewelink_enabled === '1' &&
                  !status?.sonoff?.configured &&
                  'Activé, mais non configuré — renseignez les identifiants ci-dessus'}
                {status?.sonoff?.configured && status.sonoff.lastError && (
                  <span style={{ color: 'var(--crit)' }}>Erreur : {status.sonoff.lastError}</span>
                )}
                {status?.sonoff?.configured &&
                  !status.sonoff.lastError &&
                  `${status.sonoff.deviceCount} prise(s) avec mesure de puissance · cloud ${status.sonoff.cloudOnline ? 'connecté' : 'déconnecté'} · ${status.sonoff.lanDevices} appareil(s) vus sur le réseau local`}
              </td>
            </tr>
            <tr>
              <td>Prises Omajin (Tuya)</td>
              <td>
                {settings.omajin_enabled !== '1' && 'Désactivé'}
                {settings.omajin_enabled === '1' &&
                  !status?.omajin?.configured &&
                  'Activé, mais non configuré — renseignez le projet Tuya et la prise ci-dessus'}
                {status?.omajin?.configured && status.omajin.lastError && (
                  <span style={{ color: 'var(--crit)' }}>Erreur : {status.omajin.lastError}</span>
                )}
                {status?.omajin?.configured &&
                  !status.omajin.lastError &&
                  `${status.omajin.deviceCount} prise(s) · cloud ${status.omajin.cloudOnline ? 'connecté' : 'déconnecté'}${status.omajin.lastSync ? ` · dernière mesure ${new Date(status.omajin.lastSync).toLocaleTimeString('fr-FR')}` : ''}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Sécurité du serveur et application mobile</h2>
        <p className="note">
          Le jeton de connexion contient l’adresse HTTPS et le secret nécessaires. Dans
          l’application Windows ou la future app mobile, vous ne collerez donc qu’une seule valeur.
        </p>
        <div className="settings" style={{ marginTop: 14 }}>
          <label style={{ gridColumn: '1 / -1' }}>
            Adresse HTTPS du serveur
            <input
              type="url"
              value={settings.public_server_url || ''}
              onChange={set('public_server_url')}
              placeholder="https://mon-pc.mon-tailnet.ts.net"
            />
            <small>
              Facultatif pour un usage local. Obligatoire pour créer un jeton utilisable à distance.
            </small>
          </label>
        </div>
        {desktopInfo?.applicationMode === 'server' && tailscale && (
          <div className="subpanel" style={{ marginTop: 14 }}>
            <b>Tailscale · accès distant privé (facultatif)</b>
            <p className="note" style={{ margin: '6px 0 12px' }}>
              {tailscale.connected
                ? tailscaleEnabled
                  ? `Serveur publié sur ${tailscale.serverUrl}`
                  : `PC connecté à Tailscale (${tailscale.dnsName}).`
                : tailscale.installed
                  ? 'Tailscale est installé, mais ce PC doit être connecté à votre réseau Tailscale.'
                  : 'Tailscale n’est pas installé sur ce PC.'}
            </p>
            {tailscale.connected && !tailscaleEnabled && (
              <button
                className="btn secondary"
                type="button"
                onClick={enableTailscale}
                disabled={tailscaleBusy}
              >
                {tailscaleBusy ? 'Configuration…' : 'Configurer automatiquement Tailscale'}
              </button>
            )}
            {!tailscale.installed && (
              <a
                className="btn secondary"
                href="https://tailscale.com/download/windows"
                target="_blank"
                rel="noreferrer"
              >
                Installer Tailscale
              </a>
            )}
            {tailscaleError && <p className="form-error">{tailscaleError}</p>}
          </div>
        )}
        {status?.server?.authEnabled === false && (
          <p className="warning-note">
            Cette installation existait avant l’ajout de l’authentification. Générez un jeton
            maintenant avant d’autoriser un accès depuis un autre appareil.
          </p>
        )}
        <button className="btn" type="button" onClick={rotateServerToken}>
          Générer ou renouveler le jeton de connexion
        </button>
        {newServerToken && (
          <div className="token-box" style={{ marginTop: 14 }}>
            <code>{newServerToken}</code>
            <button
              className="btn secondary"
              onClick={() => navigator.clipboard?.writeText(newServerToken)}
            >
              Copier
            </button>
          </div>
        )}
        {newServerToken && (
          <p className="warning-note">
            Copiez-le maintenant : l’ancien jeton est révoqué et cette valeur sensible ne sera plus
            affichée après avoir quitté la page.
          </p>
        )}
      </div>

      <div className="panel">
        <h2>Accès depuis un autre appareil</h2>
        <p className="note">
          Sans Tailscale, le dashboard est accessible depuis un téléphone ou une tablette connectés
          au <b>même réseau</b> que ce PC :
        </p>
        <div className="row" style={{ marginTop: 6 }}>
          {(status?.urls || []).map((u) => (
            <code
              key={u}
              style={{
                background: 'var(--page)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 13,
              }}
            >
              {u}
            </code>
          ))}
          {(!status?.urls || status.urls.length === 0) && (
            <span className="note">adresses non détectées</span>
          )}
        </div>
        <p className="note" style={{ marginTop: 8 }}>
          Le PC doit rester allumé ; l’application Windows continue la collecte dans la zone de
          notification lorsque sa fenêtre est fermée. Tailscale est l’option guidée pour l’accès
          distant privé : chaque appareil doit être connecté au même réseau Tailscale. Ne redirigez
          jamais directement ce port HTTP sur Internet.
        </p>
      </div>

      <div className="panel">
        <h2>Export CSV</h2>
        <div className="row">
          <a className="btn secondary" href="/api/export.csv?what=daily" download>
            Conso quotidienne (Linky)
          </a>
          <a className="btn secondary" href="/api/export.csv?what=loadcurve" download>
            Courbe de charge 30 min
          </a>
          <a className="btn secondary" href="/api/export.csv?what=hourly" download>
            Énergie horaire par prise
          </a>
          <a className="btn secondary" href="/api/export.csv?what=readings" download>
            Relevés bruts des prises
          </a>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Séparateur « ; », encodage UTF-8 — s'ouvre directement dans Excel. Les relevés bruts sont
          conservés {settings.raw_retention_days} jours (les agrégats horaires et quotidiens sont
          conservés sans limite).
        </p>
      </div>
    </>
  );
}
