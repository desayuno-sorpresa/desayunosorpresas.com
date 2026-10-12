import { describe, expect, it } from 'vitest';
import { buildEntry, imagePaths } from './entries';
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

describe('imagePaths', () => {
  it('numera portada y galería', () => {
    expect(imagePaths(draft)).toEqual({ cover: './fotos/01.webp', gallery: ['./fotos/02.webp'] });
  });
});

describe('buildEntry', () => {
  const first = buildEntry(draft, undefined, true, '2026-10-12');

  it('construye la entrada con la fecha de hoy si es nueva', () => {
    expect(first).toMatchObject({
      id: 'fotos',
      status: 'publicado',
      cover: './fotos/01.webp',
      gallery: [{ src: './fotos/02.webp', alt: 'Foto de la galería' }],
      updatedAt: '2026-10-12',
    });
    expect(first).not.toHaveProperty('priceFrom');
  });

  it('conserva la fecha si nada cambió', () => {
    expect(buildEntry(draft, first, false, '2026-11-01').updatedAt).toBe('2026-10-12');
  });

  it('actualiza la fecha si cambian los datos o las imágenes', () => {
    expect(buildEntry({ ...draft, title: 'Otro' }, first, false, '2026-11-01').updatedAt).toBe(
      '2026-11-01',
    );
    expect(buildEntry(draft, first, true, '2026-11-01').updatedAt).toBe('2026-11-01');
  });
});
