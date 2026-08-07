import { expect, test } from '@playwright/test';

test('onboarding, connexion, navigation, thèmes et responsive', async ({ page, context }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  await page.addInitScript(() => {
    let automaticUpdates = false;
    window.wattelierDesktop = {
      getRuntimeInfo: async () => ({
        version: '2.1.2',
        mode: 'installed',
        portable: false,
        openAtLogin: true,
        automaticUpdates,
        applicationMode: 'server',
      }),
      setOpenAtLogin: async (enabled) => ({ openAtLogin: enabled, portable: false }),
      setAutomaticUpdates: async (enabled) => {
        automaticUpdates = enabled;
        return { automaticUpdates, phase: 'idle' };
      },
      checkForUpdates: async () => ({ phase: 'up-to-date', message: 'Wattelier est à jour.' }),
      getTailscaleStatus: async () => ({
        installed: true,
        connected: true,
        dnsName: 'pc.maison.ts.net',
        serverUrl: 'https://pc.maison.ts.net',
      }),
      enableTailscale: async () => ({
        installed: true,
        connected: true,
        enabled: true,
        dnsName: 'pc.maison.ts.net',
        serverUrl: 'https://pc.maison.ts.net',
      }),
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenue dans Wattelier' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Prises Omajin/ })).toBeVisible();

  await page.getByRole('checkbox', { name: /Compteur Linky/ }).uncheck();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByLabel('Option tarifaire')).toHaveValue('base');
  await page.getByRole('button', { name: 'Terminer la configuration' }).click();
  const token = await page.locator('.token-box code').innerText();
  await page.getByRole('button', { name: 'Ouvrir Wattelier' }).click();
  await expect(page.getByRole('heading', { name: "Vue d'ensemble" })).toBeVisible();

  for (const width of [1440, 736, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      body: document.body.scrollWidth,
      html: document.documentElement.scrollWidth,
      sidebar: getComputedStyle(document.querySelector('.sidebar')).display,
      mobileNav: getComputedStyle(document.querySelector('.mobile-navigation')).display,
    }));
    expect(layout.body).toBeLessThanOrEqual(layout.viewport);
    expect(layout.html).toBeLessThanOrEqual(layout.viewport);
    expect(layout.sidebar === 'none').toBe(width <= 760);
    expect(layout.mobileNav === 'none').toBe(width > 760);
  }

  await page.setViewportSize({ width: 390, height: 900 });
  for (const [name, heading] of [
    ['Direct', 'Temps réel'],
    ['Historique', 'Historique'],
    ['Appareils', 'Appareils'],
    ['Analyses', 'Analyses'],
    ['Factures', 'Facturation'],
    ['Réglages', 'Réglages'],
  ]) {
    await page
      .getByRole('navigation', { name: 'Navigation mobile' })
      .getByRole('button', { name })
      .click();
    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    await expect(page.locator('.workspace-header h1')).toHaveText(heading);
  }
  await expect(
    page.getByRole('heading', { name: 'Sécurité du serveur et application mobile' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Configurer automatiquement Tailscale' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prises Omajin OSP-FR-01 (Tuya)' })).toBeVisible();
  await expect(page.getByLabel('Access ID Tuya')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Application Windows' })).toBeVisible();
  const automaticUpdates = page.getByRole('switch', {
    name: 'Installer automatiquement les mises à jour',
  });
  await automaticUpdates.click();
  await expect(automaticUpdates).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click();
  await expect(page.getByText('Wattelier est à jour.')).toBeVisible();

  const themeButton = page.getByRole('button', { name: /Thème/ });
  await themeButton.click();
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await context.clearCookies();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Connexion sécurisée' })).toBeVisible();
  await page.getByLabel(/Jeton d’accès ou de connexion/).fill(token);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: "Vue d'ensemble" })).toBeVisible();
});
