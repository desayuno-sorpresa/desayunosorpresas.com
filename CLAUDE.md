# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Datos del proyecto

- Propósito: web corporativa que ofrece servicios a pymes de desayunos sorpresa. Páginas: inicio (dos grupos de WhatsApp + formulario de solicitud), servicios (listado y detalle), condiciones, privacidad, 404. Futuro: casos de éxito.
- Idioma: español de Colombia (`es-CO`). Un solo idioma, sin `hreflang`.
- Stack: Astro 7 (estático), TypeScript 6, pnpm 12.7.0 (`packageManager`), Node 22 (`.nvmrc`, `engines`).
- Contenido de servicios: `src/content/servicios/servicios.json` + imágenes WebP por servicio (colección `file()` con esquema Zod). **No editar a mano**: lo genera `pnpm sync:content` desde la hoja de Google Sheets `1fhydjA3oUvsC8hRt0gOLEO5O9z_2mkQXUnNaABVQkjE` (pestañas `Servicios` y `Fotos`; fotos como enlaces de Drive). Solo se sincronizan filas en estado "Publicado" (el repo es público).
- Sync: workflow `sync-content.yml` (diario 6:00 Colombia y manual) → valida con `build` → abre/actualiza el PR `sync/contenido`; publicar = hacer merge. Credencial en el secreto `GOOGLE_SERVICE_ACCOUNT_JSON` (cuenta de servicio de solo lectura). La lógica pura está en `src/lib/content-sync/`; la red y el disco en `scripts/`.
- Formulario de ingreso: arma un mensaje y abre `wa.me/<número>`; la aprobación es manual y los enlaces de invitación de los grupos **no** se publican en el sitio.
- Dominio: `https://desayunosorpresas.com` (dominio propio en GitHub Pages) → `site` fijo en `astro.config.mjs`, `base: '/'`. `BASE_PATH` solo se usa en local para detectar rutas absolutas escritas a mano (p. ej. `BASE_PATH=/prueba`).
- Contacto: WhatsApp del administrador `+57 312 506 5058` y correo `desayunos.sorpresa.col@gmail.com` (en `src/config/site.ts`).
- Sitemap (`@astrojs/sitemap`) y `robots.txt` (`src/pages/robots.txt.ts`) activos.
- Marca: **Desayunos Sorpresa** (`siteConfig.brandName`). Repositorio: `desayuno-sorpresa/desayunosorpresas.com` (público), Pages desde GitHub Actions con dominio propio.
- Textos de condiciones y política de datos aprobados por el usuario el 2026-10-12 (`provisional: false`). Si se cambian por versiones no aprobadas, volver a `true`: `pnpm check:release` bloquea el despliegue.
- **Pendiente, no inventar:** qué es exactamente *desayunosorpresacol*.

Si una tarea depende de alguno de los datos pendientes, pregunta en lugar de suponer.

## Comandos

- `pnpm dev`: servidor local.
- `pnpm build`: `astro check && astro build` → `dist/`. Con `SHOW_DRAFTS=true` incluye borradores (todas las páginas quedan `noindex`; nunca en producción).
- `pnpm build && pnpm preview`: verificación con la base real (`/`). `BASE_PATH=/prueba pnpm build` sirve para detectar rutas absolutas. En Astro 7, `preview` usa un archivo de bloqueo: `pnpm exec astro preview stop` detiene uno previo.
- `pnpm lint`, `pnpm format:check` (`pnpm format` para corregir), `pnpm typecheck`.
- `pnpm test` (Vitest) y `pnpm test -- <ruta|patrón>` para una sola prueba.
- `pnpm test:e2e` (Playwright + axe; compila con `SHOW_DRAFTS=true` y sirve en el puerto 4321). Primera vez: `pnpm exec playwright install chromium`.
- `pnpm check:release`: falla mientras haya datos pendientes o textos provisionales.
- `pnpm sync:content`: descarga servicios y fotos (requiere `GOOGLE_SERVICE_ACCOUNT_JSON` y `SPREADSHEET_ID`; normalmente solo se ejecuta en Actions).

Instala dependencias solo con lockfile (`pnpm install --frozen-lockfile`). No añadas dependencias sin que la tarea lo requiera y sin justificarlo.

## Arquitectura

- **Astro primero, salida estática** (`output: 'static'`). Nada de SSR, endpoints en tiempo de petición ni adaptadores: GitHub Pages solo sirve archivos.
- **React solo para islas interactivas.** Si un componente no tiene estado ni eventos en el cliente, es `.astro`. Hidratación más tardía posible: `client:visible` / `client:idle` antes que `client:load`; justificar cualquier `client:load` u `client:only`.
- **Contenido** en Content Collections con esquemas Zod; los datos se validan en build, no en el navegador.
- **Capas** (mantener la dirección de dependencias hacia dentro):
  - `src/pages` y `src/layouts`: composición y rutas, sin lógica de negocio.
  - `src/components`: UI (`.astro` estáticos; React en `src/components/islands` o similar).
  - `src/lib`: lógica pura en TypeScript, sin dependencias de Astro ni React, testeable de forma aislada.
  - `src/config`: configuración del sitio (metadatos, navegación) en un único lugar.
- **SOLID pragmático:** una responsabilidad por módulo/componente; depender de tipos/interfaces y props, no de implementaciones concretas; composición sobre configuración con flags. No crear abstracciones, fábricas o interfaces sin un segundo caso de uso real.

## TypeScript

- `tsconfig` extiende `astro/tsconfigs/strictest`. Sin `any`, sin `@ts-ignore` (usar `@ts-expect-error` con motivo si es inevitable), sin aserciones `!` gratuitas.
- Props tipadas en todos los componentes. Usar alias de rutas en lugar de `../../..`.

## GitHub Pages y rutas base

- Nunca escribir rutas absolutas a mano (`/img/x.png`, `href="/about"`). Usar `import.meta.env.BASE_URL` mediante un helper único en `src/lib` o imports de assets.
- Cada cambio de enlaces o assets se verifica con `build` + `preview` usando la `base` real, no solo con `dev`.
- Incluir `public/.nojekyll`. Página `404.astro` propia. `trailingSlash` explícito y coherente con los enlaces generados.

## Rendimiento (Core Web Vitals)

- Cero JS en el cliente por defecto; cada isla debe justificar su peso.
- Imágenes con `astro:assets` (`<Image>`/`<Picture>`), dimensiones explícitas, `loading="lazy"` salvo la imagen LCP (`fetchpriority="high"`).
- Fuentes autoalojadas, subconjuntos, `font-display: swap`, preload solo de la crítica.
- Sin scripts de terceros sin aprobación explícita.

## Accesibilidad

- WCAG 2.2 AA: HTML semántico, un `h1` por página, jerarquía de encabezados, `lang`, foco visible, navegación por teclado, contraste, `alt` significativo, respetar `prefers-reduced-motion`.
- Preferir elementos nativos a ARIA.

## Seguridad

- Sin secretos en el repo ni en variables `PUBLIC_*`. Nada de `set:html` / `dangerouslySetInnerHTML` con contenido no confiable.
- `rel="noopener noreferrer"` en enlaces externos con `target="_blank"`. CSP vía `<meta>` cuando el sitio lo permita (Pages no permite cabeceras propias).
- Acciones de GitHub fijadas por versión/SHA y `permissions` mínimos.

## SEO técnico y GEO

- Componente único de `<head>`: `title` y `description` únicos por página, canonical, Open Graph/Twitter, `lang`, `hreflang` si hay varios idiomas.
- `@astrojs/sitemap` y `robots.txt` solo cuando `site` esté definido.
- Datos estructurados JSON-LD (schema.org) que reflejen contenido visible y verdadero.
- GEO: contenido útil, factual y citable (respuestas directas, encabezados descriptivos, fechas y autoría reales). No inventar datos, reseñas ni credenciales.
- Nunca prometer ni afirmar resultados de posicionamiento o visibilidad en buscadores o IA.

## CI/CD

- Workflow de GitHub Actions: checkout → setup Node (versión fijada, caché) → instalación con lockfile → lint → typecheck → test → build → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- Builds reproducibles: lockfile commiteado, versiones fijadas, sin dependencias de red en build salvo las del instalador.

## Definición de terminado

No afirmar que una tarea está terminada sin ejecutar y reportar el resultado de: `lint`, `typecheck`/`astro check`, `test`, `build` y, si cambia UI o rutas, verificación en `preview` (e2e/axe cuando existan). Si un paso no se pudo ejecutar o falla, decirlo explícitamente con la salida.
