import { expect, test } from '@playwright/test';

test('onboarding, connexion, navigation, thèmes et responsive', async ({ page, context }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenue dans Wattelier' })).toBeVisible();

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

  const themeButton = page.getByRole('button', { name: /Thème/ });
  await themeButton.click();
  await themeButton.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await context.clearCookies();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Connexion sécurisée' })).toBeVisible();
  await page.getByLabel(/Jeton d’accès/).fill(token);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: "Vue d'ensemble" })).toBeVisible();
});
