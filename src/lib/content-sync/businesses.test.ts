import { describe, expect, it } from 'vitest';
import { buildBusinessEntry, parseBusinesses } from './businesses';
import { formatProblem } from './problems';
import type { SheetCell, SheetGrid } from './sheet';

const IMG = 'IMGIMGIMGIMGIMGIMGIMGIMGIMG01';
const HEADERS = [
  'Nombre',
  'Identificador',
  'Enlace',
  'Descripción',
  'Ciudad',
  'Logo o foto',
  'Descripción imagen',
  'Destacado',
  'Orden',
  'Estado',
  'Errores a corregir',
  'Detalle error',
];

const row = (values: string[]): SheetCell[] => values.map((text) => ({ text }));

const alova = [
  'Alova',
  '',
  'https://alova.desayunosorpresas.com',
  'Desayunos sorpresa artesanales con entrega a domicilio.',
  'Bogotá',
  `https://drive.google.com/file/d/${IMG}/view`,
  'Caja de desayuno con fresas y globos',
  'Sí',
  '',
  'Publicado',
];

function errorsOf(grid: SheetGrid): string[] {
  return parseBusinesses(grid).problems.map(formatProblem);
}

describe('parseBusinesses', () => {
  it('convierte un negocio publicado', () => {
    const result = parseBusinesses([row(HEADERS), row(alova)]);
    expect(result.problems).toEqual([]);
    expect(result.items).toEqual([
      {
        slug: 'alova',
        name: 'Alova',
        url: 'https://alova.desayunosorpresas.com/',
        summary: 'Desayunos sorpresa artesanales con entrega a domicilio.',
        city: 'Bogotá',
        featured: true,
        order: 2,
        image: {
          fileId: IMG,
          alt: 'Caja de desayuno con fresas y globos',
          source: { sheet: 'Negocios', row: 2 },
        },
      },
    ]);
  });

  it('acepta la pestaña vacía o inexistente sin errores', () => {
    expect(parseBusinesses([])).toEqual({ items: [], problems: [], notes: [], rows: 0, drafts: 0 });
  });

  it('usa el enlace de la celda aunque el texto sea otro', () => {
    const cells = row(alova);
    cells[2] = { text: 'Página de Alova', link: 'https://alova.desayunosorpresas.com' };
    expect(parseBusinesses([row(HEADERS), cells]).items[0]?.url).toBe(
      'https://alova.desayunosorpresas.com/',
    );
  });

  it('anota los borradores sin revisarlos', () => {
    const draft = [...alova];
    draft[9] = 'Borrador';
    draft[2] = 'no es un enlace';
    const result = parseBusinesses([row(HEADERS), row(draft)]);
    expect(result).toMatchObject({ items: [], problems: [], drafts: 1 });
    expect(result.notes).toEqual([
      { sheet: 'Negocios', row: 2, text: 'Borrador: no se publica ni se revisa' },
    ]);
  });

  it('reporta enlace inválido, destacado desconocido e imagen faltante', () => {
    const invalid = [...alova];
    invalid[2] = 'http://alova.desayunosorpresas.com';
    invalid[5] = 'logo.png';
    invalid[7] = 'tal vez';
    expect(errorsOf([row(HEADERS), row(invalid)])).toEqual([
      'Negocios, fila 2: "Enlace" debe empezar por "https://" (conexión segura).',
      'Negocios, fila 2: "Logo o foto" debe ser un enlace de Google Drive a la imagen.',
      'Negocios, fila 2: "Destacado" debe ser "Sí" o "No" (o quedar vacío).',
    ]);
  });

  it('detecta enlaces e identificadores repetidos', () => {
    const copy = [...alova];
    copy[0] = 'Alova Norte';
    const sameName = [...alova];
    sameName[2] = 'https://otro.desayunosorpresas.com';
    expect(errorsOf([row(HEADERS), row(alova), row(copy), row(sameName)])).toEqual([
      'Negocios, fila 3: "Enlace" ya se usa en la fila 2.',
      'Negocios, fila 4: el identificador "alova" ya se usa en la fila 2.',
    ]);
  });

  it('aplica la revisión de contenido', () => {
    const promising = [...alova];
    promising[3] = 'Los mejores desayunos, 100% garantizados';
    promising[6] = promising[3];
    expect(errorsOf([row(HEADERS), row(promising)])).toEqual([
      'Negocios, fila 2: "Descripción" promete resultados garantizados; describe lo que incluye el servicio, no resultados.',
      'Negocios, fila 2: "Descripción" usa una promesa absoluta ("100 %"); describe el servicio sin asegurar resultados.',
      'Negocios, fila 2: "Descripción imagen" promete resultados garantizados; describe lo que incluye el servicio, no resultados.',
      'Negocios, fila 2: "Descripción imagen" usa una promesa absoluta ("100 %"); describe el servicio sin asegurar resultados.',
      'Negocios, fila 2: "Descripción imagen" repite el resumen del servicio; describe lo que se ve en la foto.',
    ]);
  });

  it('ordena por "Orden" y luego por nombre', () => {
    const second = [...alova];
    second[0] = 'Bonita Mañana';
    second[2] = 'https://bonita.example.com';
    second[8] = '1';
    const third = [...alova];
    third[0] = 'Aurora';
    third[2] = 'https://aurora.example.com';
    third[8] = '1';
    const result = parseBusinesses([row(HEADERS), row(alova), row(second), row(third)]);
    expect(result.items.map((item) => item.name)).toEqual(['Aurora', 'Bonita Mañana', 'Alova']);
  });
});

describe('buildBusinessEntry', () => {
  it('genera la entrada con la imagen 01', () => {
    const [draft] = parseBusinesses([row(HEADERS), row(alova)]).items;
    if (!draft) throw new Error('falta el negocio');
    expect(buildBusinessEntry(draft, undefined, true, '2026-10-12')).toEqual({
      id: 'alova',
      name: 'Alova',
      url: 'https://alova.desayunosorpresas.com/',
      summary: 'Desayunos sorpresa artesanales con entrega a domicilio.',
      city: 'Bogotá',
      image: './alova/01.webp',
      imageAlt: 'Caja de desayuno con fresas y globos',
      featured: true,
      order: 2,
      status: 'publicado',
      updatedAt: '2026-10-12',
    });
  });
});
