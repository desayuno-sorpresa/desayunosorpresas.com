import { describe, expect, it } from 'vitest';
import { buildServiceEntry, serviceImages } from './entries';
import type { ServiceDraft } from './services';

const draft: ServiceDraft = {
  slug: 'fotos',
  title: 'Fotos',
  summary: 'Resumen del servicio.',
  description: ['Uno.'],
  benefits: [],
  order: 1,
  cover: { fileId: 'a', alt: 'Portada del servicio', source: { sheet: 'Servicios', row: 2 } },
  gallery: [{ fileId: 'b', alt: 'Foto de la galería', source: { sheet: 'Fotos', row: 2 } }],
};

describe('serviceImages', () => {
  it('pone la portada primero y luego la galería', () => {
    expect(serviceImages(draft).map((ref) => ref.fileId)).toEqual(['a', 'b']);
  });
});

describe('buildServiceEntry', () => {
  const first = buildServiceEntry(draft, undefined, true, '2026-10-12');

  it('construye la entrada con portada 01 y galería desde 02', () => {
    expect(first).toMatchObject({
      id: 'fotos',
      status: 'publicado',
      cover: './fotos/01.webp',
      gallery: [{ src: './fotos/02.webp', alt: 'Foto de la galería' }],
      updatedAt: '2026-10-12',
    });
    expect(first).not.toHaveProperty('priceFrom');
  });

  it('conserva la fecha si nada cambió y la actualiza si cambian datos o imágenes', () => {
    expect(buildServiceEntry(draft, first, false, '2026-11-01').updatedAt).toBe('2026-10-12');
    expect(
      buildServiceEntry({ ...draft, title: 'Otro' }, first, false, '2026-11-01').updatedAt,
    ).toBe('2026-11-01');
    expect(buildServiceEntry(draft, first, true, '2026-11-01').updatedAt).toBe('2026-11-01');
  });
});
