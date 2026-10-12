import { describe, expect, it } from 'vitest';
import { imageFiles, imageName, stampEntry } from './collection';

describe('imageFiles', () => {
  it('numera las imágenes con dos dígitos', () => {
    expect(imageFiles('alova', 2)).toEqual(['./alova/01.webp', './alova/02.webp']);
    expect(imageFiles('x', 0)).toEqual([]);
  });
});

describe('imageName', () => {
  it('nombra la imagen según su pestaña', () => {
    const ref = (sheet: 'Servicios' | 'Fotos' | 'Negocios') => ({
      fileId: 'a',
      alt: 'x',
      source: { sheet, row: 4 },
    });
    expect(imageName(ref('Servicios'))).toBe('la portada (Servicios, fila 4)');
    expect(imageName(ref('Fotos'))).toBe('la foto de Fotos, fila 4');
    expect(imageName(ref('Negocios'))).toBe('la imagen de Negocios, fila 4');
  });
});

describe('stampEntry', () => {
  const previous = { id: 'a', name: 'Uno', updatedAt: '2026-01-01' };

  it('usa la fecha de hoy para elementos nuevos o modificados', () => {
    expect(stampEntry({ id: 'a', name: 'Uno' }, undefined, false, '2026-10-12').updatedAt).toBe(
      '2026-10-12',
    );
    expect(stampEntry({ id: 'a', name: 'Dos' }, previous, false, '2026-10-12').updatedAt).toBe(
      '2026-10-12',
    );
  });

  it('conserva la fecha anterior si nada cambió', () => {
    expect(stampEntry({ id: 'a', name: 'Uno' }, previous, false, '2026-10-12').updatedAt).toBe(
      '2026-01-01',
    );
  });
});
