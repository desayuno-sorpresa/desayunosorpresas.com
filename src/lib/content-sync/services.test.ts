import { describe, expect, it } from 'vitest';
import { formatProblem } from './problems';
import type { SheetCell, SheetGrid } from './sheet';
import { parseServices } from './services';

/** Errores como texto de una línea, igual que en los registros del sync. */
function errorsOf(services: SheetGrid, photos: SheetGrid): string[] {
  return parseServices(services, photos).problems.map(formatProblem);
}

const ID_A = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ID_B = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const ID_C = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const link = (id: string) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;

const SERVICE_HEADERS = [
  'Título',
  'Identificador',
  'Resumen',
  'Descripción',
  'Beneficios',
  'Precio desde',
  'Orden',
  'Estado',
  'Texto botón',
  'Portada',
  'Descripción portada',
];
const PHOTO_HEADERS = ['Servicio', 'Foto', 'Descripción foto', 'Orden'];

function row(values: (string | SheetCell)[]): SheetCell[] {
  return values.map((value) => (typeof value === 'string' ? { text: value } : value));
}

const validService = [
  'Fotografía de producto',
  '',
  'Fotos profesionales de tus desayunos para redes sociales.',
  'Primer párrafo.\nSegundo párrafo.',
  '- Edición incluida\n- Entrega en 3 días',
  '$ 150.000',
  '2',
  'Publicado',
  'Quiero fotos',
  link(ID_A),
  'Bandeja de desayuno con globos dorados',
];

describe('parseServices', () => {
  it('convierte un servicio publicado con su galería ordenada', () => {
    const result = parseServices(
      [row(SERVICE_HEADERS), row(validService)],
      [
        row(PHOTO_HEADERS),
        row(['Fotografía de producto', link(ID_C), 'Detalle de la caja de regalo', '2']),
        row(['fotografia-de-producto', ID_B, 'Taza con mensaje personalizado', '1']),
      ],
    );
    expect(result.problems).toEqual([]);
    expect(result.services).toEqual([
      {
        slug: 'fotografia-de-producto',
        title: 'Fotografía de producto',
        summary: 'Fotos profesionales de tus desayunos para redes sociales.',
        description: ['Primer párrafo.', 'Segundo párrafo.'],
        benefits: ['Edición incluida', 'Entrega en 3 días'],
        priceFrom: 150000,
        order: 2,
        ctaLabel: 'Quiero fotos',
        cover: {
          fileId: ID_A,
          alt: 'Bandeja de desayuno con globos dorados',
          source: { sheet: 'Servicios', row: 2 },
        },
        gallery: [
          {
            fileId: ID_B,
            alt: 'Taza con mensaje personalizado',
            source: { sheet: 'Fotos', row: 3 },
          },
          {
            fileId: ID_C,
            alt: 'Detalle de la caja de regalo',
            source: { sheet: 'Fotos', row: 2 },
          },
        ],
      },
    ]);
  });

  it('usa el enlace de un chip de Drive aunque el texto sea el nombre del archivo', () => {
    const service = [...validService];
    const cells = row(service);
    cells[9] = { text: 'portada.jpg', link: link(ID_B) };
    const result = parseServices([row(SERVICE_HEADERS), cells], [row(PHOTO_HEADERS)]);
    expect(result.services[0]?.cover.fileId).toBe(ID_B);
  });

  it('ignora borradores y sus fotos sin errores, con una nota por fila', () => {
    const draft = [...validService];
    draft[7] = 'Borrador';
    const result = parseServices(
      [row(SERVICE_HEADERS), row(draft)],
      [row(PHOTO_HEADERS), row(['Fotografía de producto', ID_B, 'Una foto de ejemplo', ''])],
    );
    expect(result).toEqual({
      services: [],
      problems: [],
      notes: [
        { sheet: 'Servicios', row: 2, text: 'Borrador: no se publica ni se revisa' },
        { sheet: 'Fotos', row: 2, text: 'Servicio en borrador: no se publica' },
      ],
      rows: 1,
      drafts: 1,
    });
  });

  it('reporta errores con fila y columna', () => {
    const invalid = [...validService];
    invalid[2] = 'Corto';
    invalid[5] = 'gratis';
    invalid[9] = 'foto.jpg';
    invalid[10] = '';
    const result = parseServices([row(SERVICE_HEADERS), row(invalid)], [row(PHOTO_HEADERS)]);
    expect(result.services).toEqual([]);
    expect(result.problems.map(formatProblem)).toEqual([
      'Servicios, fila 2: "Resumen" es demasiado corto (mínimo 10 caracteres).',
      'Servicios, fila 2: "Precio desde" debe ser un número, p. ej. 150000.',
      'Servicios, fila 2: "Portada" debe ser un enlace de Google Drive a la foto.',
      'Servicios, fila 2: "Descripción portada" debe describir la foto (mínimo 5 caracteres).',
    ]);
  });

  it('detecta identificadores duplicados, estados inválidos y fotos huérfanas', () => {
    const second = [...validService];
    second[0] = 'Fotografía de producto';
    const unknownStatus = [...validService];
    unknownStatus[7] = 'Listo';
    const errors = errorsOf(
      [row(SERVICE_HEADERS), row(validService), row(second), row(unknownStatus)],
      [row(PHOTO_HEADERS), row(['Servicio inexistente', ID_B, 'Una foto cualquiera', ''])],
    );
    expect(errors).toEqual([
      'Servicios, fila 3: el identificador "fotografia-de-producto" ya se usa en la fila 2.',
      'Servicios, fila 4: "Estado" debe ser "Publicado" o "Borrador".',
      'Fotos, fila 2: "Servicio": no existe un servicio publicado llamado "Servicio inexistente" (o tiene errores).',
    ]);
  });

  it('incluye la revisión de contenido con fila y columna', () => {
    const promising = [...validService];
    promising[3] = 'Visibilidad mayor en google.';
    const result = parseServices([row(SERVICE_HEADERS), row(promising)], [row(PHOTO_HEADERS)]);
    expect(result.services).toEqual([]);
    expect(result.problems.map(formatProblem)).toEqual([
      'Servicios, fila 2: "Descripción" promete resultados en Google o buscadores; no se pueden asegurar.',
      'Servicios, fila 2: "Descripción" escribe la marca como "Google".',
    ]);
  });

  it('marca en la fila de Fotos la misma foto usada como portada', () => {
    const errors = errorsOf(
      [row(SERVICE_HEADERS), row(validService)],
      [
        row(PHOTO_HEADERS),
        row(['Fotografía de producto', link(ID_A), 'Otra vista del desayuno', '']),
      ],
    );
    expect(errors).toEqual([
      'Fotos, fila 2: "Foto" es la misma imagen que la portada (Servicios, fila 2); usa otra foto.',
    ]);
  });

  it('marca en la fila de Fotos las descripciones que repiten el resumen o se repiten', () => {
    const errors = errorsOf(
      [row(SERVICE_HEADERS), row(validService)],
      [
        row(PHOTO_HEADERS),
        row([
          'Fotografía de producto',
          ID_B,
          'Fotos profesionales de tus desayunos para redes sociales.',
          '',
        ]),
        row(['Fotografía de producto', ID_C, 'Bandeja de desayuno con globos dorados', '']),
      ],
    );
    expect(errors).toEqual([
      'Fotos, fila 2: "Descripción foto" repite el resumen del servicio; describe lo que se ve en la foto.',
      'Fotos, fila 3: "Descripción foto" es igual a la de la portada (Servicios, fila 2); cada foto necesita su propia descripción.',
    ]);
  });

  it('informa columnas faltantes como problema de toda la pestaña', () => {
    const result = parseServices([row(['Título'])], [row(PHOTO_HEADERS)]);
    expect(result.problems[0]).toEqual({
      sheet: 'Servicios',
      message: expect.stringMatching(/faltan las columnas "resumen"/),
    });
  });

  it('ignora las columnas de resultado al leer y al detectar filas vacías', () => {
    const headers = [...SERVICE_HEADERS, 'Errores a corregir', 'Detalle error'];
    const result = parseServices(
      [
        row(headers),
        row([...validService, '⚠️ 1 error', '• algo']),
        row([...validService.map(() => ''), '✅ Sin errores', '']),
      ],
      [row(PHOTO_HEADERS)],
    );
    expect(result.problems).toEqual([]);
    expect(result.rows).toBe(1);
  });
});
