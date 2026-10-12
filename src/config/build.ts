/**
 * Opciones de build leídas del entorno (solo en tiempo de compilación).
 * SHOW_DRAFTS=true incluye servicios en borrador y marca todas las páginas como noindex;
 * se usa en revisión local y en las pruebas e2e, nunca en el workflow de despliegue.
 */
export const includeDrafts = process.env['SHOW_DRAFTS'] === 'true';
