import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';
import { SERVICE_LIMITS as L, SLUG_PATTERN } from '@/lib/content-sync/limits';

/*
 * Servicios: el JSON y sus imágenes los genera `pnpm sync:content` (scripts/sync-content.ts)
 * a partir de Google Sheets + Google Drive. No editar a mano: el próximo sync lo sobrescribe.
 */
const servicios = defineCollection({
  loader: file('src/content/servicios/servicios.json', {
    parser: (text) => {
      const entries: unknown = JSON.parse(text);
      if (!Array.isArray(entries)) throw new Error('servicios.json debe ser una lista.');
      for (const entry of entries) {
        const id: unknown = entry?.id;
        if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
          throw new Error(`Identificador de servicio no válido: ${JSON.stringify(id)}`);
        }
      }
      return entries;
    },
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

export const collections = { servicios };
