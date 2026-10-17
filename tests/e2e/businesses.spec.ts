import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Datos de tests/fixtures/content: 6 negocios, los 5 primeros destacados.

test.describe('directorio de negocios', () => {
  test('lista todos los negocios con enlaces externos seguros', async ({ page }) => {
    await page.goto('negocios/');
    const links = page.getByRole('link', { name: /^Visitar página de/ });
    await expect(links).toHaveCount(6);
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute('href', /^https:\/\//);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    await expect(page.getByRole('heading', { level: 2, name: 'Negocio Uno' })).toBeVisible();
  });

  test('el menú incluye Negocios y marca la página actual', async ({ page }) => {
    await page.goto('negocios/');
    const toggle = page.getByRole('button', { name: 'Menú' });
    if (await toggle.isVisible()) await toggle.click();
    await expect(
      page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Negocios' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('carrusel de destacados en el inicio', () => {
  test('muestra solo los destacados con enlace a cada página', async ({ page }) => {
    await page.goto('./');
    const section = page.getByRole('region', { name: 'Negocios destacados' });
    const track = section.getByRole('list', { name: 'Negocios destacados' });
    await expect(track.getByRole('listitem')).toHaveCount(5);
    await expect(track.getByText('Negocio Seis')).toHaveCount(0);
    await expect(section.getByRole('link', { name: 'Ver todos los negocios' })).toHaveAttribute(
      'href',
      '/negocios/',
    );
  });

  test('los botones desplazan la pista y se deshabilitan en los extremos', async ({ page }) => {
    await page.goto('./');
    const section = page.getByRole('region', { name: 'Negocios destacados' });
    const track = section.getByRole('list', { name: 'Negocios destacados' });
    const prev = section.getByRole('button', { name: 'Anterior' });
    const next = section.getByRole('button', { name: 'Siguiente' });
    const scrollLeft = () => track.evaluate((el) => el.scrollLeft);

    await expect(prev).toBeDisabled();
    await next.click();
    await expect.poll(scrollLeft).toBeGreaterThan(0);
    await expect(prev).toBeEnabled();

    // Llegar al final deshabilita "Siguiente".
    for (let i = 0; i < 10 && (await next.isEnabled()); i += 1) {
      await next.click();
      await page.waitForTimeout(400);
    }
    await expect(next).toBeDisabled();
  });

  test('la pista se puede desplazar con el teclado', async ({ page }) => {
    await page.goto('./');
    const track = page.getByRole('list', { name: 'Negocios destacados' });
    await track.focus();
    await expect(track).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test('sin violaciones de accesibilidad en la sección', async ({ page }) => {
    await page.goto('./');
    const results = await new AxeBuilder({ page })
      .include('[aria-labelledby="destacados"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
