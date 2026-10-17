import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import {
  BUSINESS_LIMITS as B,
  REQUEST_LIMITS as R,
  SERVICE_LIMITS as L,
  SLUG_PATTERN,
} from '@/lib/content-sync/limits';
import { parseHttpsUrl } from '@/lib/content-sync/links';
import { GROUP_IDS } from '@/lib/join-request';
import { parseIsoDate } from '@/lib/recent-requests';

/*
 * El JSON y las imágenes de cada colección los genera `pnpm sync:content`
 * (scripts/sync-content.ts) a partir de Google Sheets + Google Drive.
 * No editar a mano: el próximo sync lo sobrescribe.
 *
 * CONTENT_DIR permite compilar con datos de prueba fijos (tests/fixtures/content) en e2e.
 */
const CONTENT_DIR = process.env['CONTENT_DIR'] || 'src/content';

/** Lista JSON cuyos `id` son aptos para URL. */
function listWithSlugIds(name: string) {
  return (text: string) => {
    const entries: unknown = JSON.parse(text);
    if (!Array.isArray(entries)) throw new Error(`${name}.json debe ser una lista.`);
    for (const entry of entries) {
      const id: unknown = entry?.id;
      if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
        throw new Error(`Identificador no válido en ${name}.json: ${JSON.stringify(id)}`);
      }
    }
    return entries;
  };
}

const servicios = defineCollection({
  loader: file(`${CONTENT_DIR}/servicios/servicios.json`, {
    parser: listWithSlugIds('servicios'),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(L.title.min).max(L.title.max),
      summary: z.string().min(L.summary.min).max(L.summary.max),
      description: z.array(z.string().min(1)).min(1),
      benefits: z.array(z.string().min(1)).default([]),
      priceFrom: z.number().int().positive().optional(),
      order: z.number().int(),
      status: z.enum(['borrador', 'publicado']),
      ctaLabel: z.string().min(L.ctaLabel.min).max(L.ctaLabel.max).optional(),
      cover: image(),
      coverAlt: z.string().min(L.altMin),
      gallery: z.array(z.object({ src: image(), alt: z.string().min(L.altMin) })).default([]),
      updatedAt: z.coerce.date(),
    }),
});

const negocios = defineCollection({
  loader: file(`${CONTENT_DIR}/negocios/negocios.json`, {
    parser: listWithSlugIds('negocios'),
  }),
  schema: ({ image }) =>
    z.object({
      name: z.string().min(B.name.min).max(B.name.max),
      url: z
        .string()
        .refine((value) => parseHttpsUrl(value).ok, 'Debe ser un enlace https:// válido.'),
      summary: z.string().min(B.summary.min).max(B.summary.max),
      city: z.string().min(B.city.min).max(B.city.max),
      image: image(),
      imageAlt: z.string().min(L.altMin),
      featured: z.boolean(),
      order: z.number().int(),
      status: z.literal('publicado'),
      updatedAt: z.coerce.date(),
    }),
});

// Solicitudes de ingreso anónimas (fecha, grupo y ciudad) para el aviso de actividad.
const solicitudes = defineCollection({
  loader: file(`${CONTENT_DIR}/solicitudes/solicitudes.json`, {
    parser: listWithSlugIds('solicitudes'),
  }),
  schema: z.object({
    date: z.string().refine((value) => parseIsoDate(value) !== null, 'Fecha YYYY-MM-DD.'),
    group: z.enum(GROUP_IDS),
    city: z.string().min(R.city.min).max(R.city.max),
    updatedAt: z.coerce.date(),
  }),
});

export const collections = { servicios, negocios, solicitudes };
