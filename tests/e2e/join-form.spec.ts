import { expect, test } from '@playwright/test';

test.describe('formulario de solicitud', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./#solicitud');
  });

  test('sin número configurado se muestra deshabilitado con aviso', async ({ page }) => {
    const form = page.locator('[data-join-form]');
    test.skip((await form.getAttribute('data-phone')) !== '', 'El número ya está configurado.');
    await expect(form.getByRole('note')).toContainText('falta configurar el número');
    await expect(
      form.getByRole('button', { name: 'Enviar solicitud por WhatsApp' }),
    ).toBeDisabled();
  });

  test('valida y abre WhatsApp con el mensaje', async ({ page }) => {
    const form = page.locator('[data-join-form]');
    test.skip((await form.getAttribute('data-phone')) === '', 'Falta el número del administrador.');

    await form.getByRole('button', { name: 'Enviar solicitud por WhatsApp' }).click();
    await expect(form.locator('[data-error-summary]')).toBeFocused();
    await expect(form.getByLabel('Tu nombre')).toHaveAttribute('aria-invalid', 'true');

    await form.getByLabel('Grupo privado de negocios').check();
    await form.getByLabel('Tu nombre').fill('Ana');
    await form.getByLabel('Nombre del negocio').fill('Dulce Mañana');
    await form.getByLabel('Ciudad').fill('Cali');
    await form.getByLabel('Instagram, web o catálogo del negocio').fill('@dulce');
    await form.getByLabel('Acepto las condiciones del grupo').check();
    await form.getByLabel('Autorizo el tratamiento de mis datos').check();

    await page.route('https://wa.me/**', (route) => route.fulfill({ body: 'ok' }));
    const [request] = await Promise.all([
      page.waitForRequest('https://wa.me/**'),
      form.getByRole('button', { name: 'Enviar solicitud por WhatsApp' }).click(),
    ]);
    const text = new URL(request.url()).searchParams.get('text') ?? '';
    expect(text).toContain('*Grupo privado de negocios*');
    expect(text).toContain('• Negocio: Dulce Mañana');
  });
});
