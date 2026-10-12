import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { z } from 'astro/zod';

/*
 * Servicios: en la fase 2 este JSON y sus imágenes los genera `scripts/sync-sheets.ts`
 * a partir de Google Sheets + Google Drive. No editar a mano en producción.
 */
const servicios = defineCollection({
  loader: file('src/content/servicios/servicios.json'),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(3).max(90),
      summary: z.string().min(10).max(160),
      description: z.array(z.string().min(1)).min(1),
      benefits: z.array(z.string().min(1)).default([]),
      priceFrom: z.number().int().positive().optional(),
      order: z.number().int(),
      status: z.enum(['borrador', 'publicado']),
      ctaLabel: z.string().min(2).max(40).optional(),
      cover: image(),
      coverAlt: z.string().min(5),
      gallery: z.array(z.object({ src: image(), alt: z.string().min(5) })).default([]),
      updatedAt: z.coerce.date(),
    }),
});

export const collections = { servicios };
