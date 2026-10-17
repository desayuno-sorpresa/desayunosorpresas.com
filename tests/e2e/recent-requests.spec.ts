import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Fecha fija: los datos de prueba (tests/fixtures/content/solicitudes) son del 16 y 17 de octubre.
const NOW = new Date('2026-10-17T12:00:00-05:00');

test.describe('aviso de solicitudes recientes', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: NOW });
    await page.goto('./');
  });

  test('muestra cada solicitud reciente una vez, sin las antiguas', async ({ page }) => {
    const toast = page.getByRole('complementary', { name: 'Solicitudes recientes' });
    await expect(toast).toBeHidden();

    await page.clock.runFor(4_500);
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(
      'Un negocio de Medellín solicitó unirse al grupo privado de negocios',
    );
    await expect(toast).toContainText('Hoy');

    await page.clock.runFor(7_000 + 300 + 9_000 + 500);
    await expect(toast).toContainText(
      'Alguien de Bogotá solicitó unirse al grupo de clientes y negocios',
    );
    await expect(toast).toContainText('Ayer');

    // La de septiembre (más de 14 días) nunca aparece y el aviso termina.
    await page.clock.runFor(7_000 + 300 + 9_000 + 7_000 + 1_000);
    await expect(toast).toBeHidden();
    await expect(page.getByText('Un negocio de Cali')).toHaveCount(0);
  });

  test('se puede cerrar y no vuelve a salir en la visita', async ({ page }) => {
    const toast = page.getByRole('complementary', { name: 'Solicitudes recientes' });
    await page.clock.runFor(4_500);
    await expect(toast).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-requests-toast]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await toast.getByRole('button', { name: 'Ocultar avisos de solicitudes' }).click();
    await expect(toast).toBeHidden();

    await page.reload();
    await page.clock.runFor(30_000);
    await expect(toast).toBeHidden();
  });
});
