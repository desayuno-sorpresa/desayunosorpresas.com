import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  { path: './', h1: 'Servicios y comunidad para negocios de desayunos sorpresa' },
  { path: 'servicios/', h1: 'Servicios para tu negocio' },
  { path: 'servicios/ejemplo-fotografia/', h1: 'Servicio de ejemplo: fotografía de producto' },
  { path: 'condiciones/', h1: 'Condiciones de los grupos' },
  { path: 'privacidad/', h1: 'Tratamiento de datos personales' },
] as const;

for (const { path, h1 } of PAGES) {
  test.describe(`página ${path}`, () => {
    test('responde, tiene un único h1 y no viola CSP', async ({ page }) => {
      const cspErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
          cspErrors.push(message.text());
        }
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).toHaveText(h1);
      await expect(page.locator('html')).toHaveAttribute('lang', 'es-CO');
      expect(cspErrors).toEqual([]);
    });

    test('sin violaciones de accesibilidad WCAG 2.2 AA', async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  });
}

test('todos los enlaces internos responden', async ({ page, request }) => {
  const visited = new Set<string>();
  for (const { path } of PAGES) {
    await page.goto(path);
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const url = href.split('#')[0] ?? href;
      if (visited.has(url)) continue;
      visited.add(url);
      const response = await request.get(url);
      expect(response.status(), url).toBe(200);
    }
  }
});

test('la página 404 se muestra para rutas inexistentes', async ({ page }) => {
  const response = await page.goto('no-existe/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText('Página no encontrada');
});
