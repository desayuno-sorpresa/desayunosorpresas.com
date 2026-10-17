// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { siteConfig } from './src/config/site.ts';

// Orígenes del Apps Script que guarda solicitudes (responde con una redirección a googleusercontent).
const saveOrigins = siteConfig.joinRequests.endpoint
  ? ['https://script.google.com', 'https://script.googleusercontent.com']
  : [];

/*
 * Dominio propio en GitHub Pages: base '/'.
 * BASE_PATH solo existe para probar en local que no hay rutas absolutas escritas a mano
 * (p. ej. BASE_PATH=/prueba); el despliegue nunca lo define.
 */
export default defineConfig({
  output: 'static',
  site: 'https://desayunosorpresas.com',
  base: process.env.BASE_PATH || '/',
  integrations: [sitemap()],
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src ${["'self'", ...saveOrigins].join(' ')}`,
        "base-uri 'self'",
        "form-action 'self' https://wa.me",
        "object-src 'none'",
      ],
    },
  },
});
