import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatProblem } from '../src/lib/content-sync/problems';
import type { SheetCell, SheetGrid } from '../src/lib/content-sync/sheet';
import type { ColumnWrite } from '../src/lib/content-sync/status';
import type { ContentSource, DriveFile } from './google/client';
import { runSync, SyncError, type LinkChecker, type SyncOptions } from './sync-content';

const COVER = 'COVERCOVERCOVERCOVERCOVER01';
const PHOTO = 'PHOTOPHOTOPHOTOPHOTOPHOTO02';
const LOGO = 'LOGOLOGOLOGOLOGOLOGOLOGOLOGO3';
const AT = '2026-10-12 06:00';
const REVIEW_HEADERS = ['Errores a corregir', 'Detalle error'];

const cells = (values: string[]): SheetCell[] => values.map((text) => ({ text }));

function servicesGrid(overrides: Partial<Record<'status' | 'cover', string>> = {}): SheetGrid {
  return [
    cells([
      'Título',
      'Resumen',
      'Descripción',
      'Estado',
      'Portada',
      'Descripción portada',
      ...REVIEW_HEADERS,
    ]),
    cells([
      'Fotografía de producto',
      'Fotos profesionales para tus redes sociales.',
      'Párrafo uno.',
      overrides.status ?? 'Publicado',
      overrides.cover ?? COVER,
      'Bandeja con globos dorados',
    ]),
  ];
}

const photosGrid: SheetGrid = [
  cells(['Servicio', 'Foto', 'Descripción foto', ...REVIEW_HEADERS]),
  cells(['Fotografía de producto', PHOTO, 'Taza con mensaje']),
];

const businessesGrid: SheetGrid = [
  cells([
    'Nombre',
    'Enlace',
    'Descripción',
    'Ciudad',
    'Logo o foto',
    'Descripción imagen',
    'Destacado',
    'Estado',
    ...REVIEW_HEADERS,
  ]),
  cells([
    'Alova',
    'https://alova.desayunosorpresas.com',
    'Desayunos sorpresa artesanales a domicilio.',
    'Bogotá',
    LOGO,
    'Caja de desayuno con fresas',
    'Sí',
    'Publicado',
  ]),
];

async function jpeg(color: string, width = 3000): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height: 1000, channels: 3, background: color } })
      .jpeg()
      .toBuffer(),
  );
}

interface FakeSource extends ContentSource {
  written: Map<string, ColumnWrite[]>;
}

function fakeSource(
  sheets: Map<string, SheetGrid>,
  files: Record<string, DriveFile>,
  options: { failWrites?: boolean } = {},
): FakeSource {
  const written = new Map<string, ColumnWrite[]>();
  return {
    written,
    async readSheets(names) {
      return new Map([...sheets].filter(([name]) => names.includes(name)));
    },
    async downloadImage(fileId) {
      const file = files[fileId];
      if (!file) throw new Error(`Archivo ${fileId} no encontrado o no compartido.`);
      return file;
    },
    async writeColumns(sheet, writes) {
      if (options.failWrites) throw new Error('Sin acceso a escribir en la hoja de cálculo (403).');
      written.set(sheet, [...writes]);
    },
  };
}

function allSheets(services: SheetGrid = servicesGrid()): Map<string, SheetGrid> {
  return new Map([
    ['Servicios', services],
    ['Fotos', photosGrid],
    ['Negocios', businessesGrid],
  ]);
}

async function validFiles(): Promise<Record<string, DriveFile>> {
  return {
    [COVER]: { name: 'portada.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#f4c27a') },
    [PHOTO]: { name: 'taza.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#9cc9b4', 800) },
    [LOGO]: { name: 'logo.png', mimeType: 'image/jpeg', bytes: await jpeg('#e8a0a0', 600) },
  };
}

const linksOk: LinkChecker = async () => null;

async function failure(source: ContentSource, options: SyncOptions): Promise<SyncError> {
  const error = await runSync(source, options).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  return error as SyncError;
}

async function readJson(dir: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(dir, name, `${name}.json`), 'utf8'));
}

let contentDir: string;
let options: SyncOptions;

beforeEach(async () => {
  contentDir = await mkdtemp(path.join(tmpdir(), 'sync-'));
  options = { contentDir, today: '2026-10-12', reviewedAt: AT, checkLink: linksOk };
});

afterEach(async () => {
  await rm(contentDir, { recursive: true, force: true });
});

describe('runSync', () => {
  it('escribe servicios y negocios, marca la hoja sin errores y es idempotente', async () => {
    const files = await validFiles();
    const source = fakeSource(allSheets(), files);

    const first = await runSync(source, options);
    expect(first).toEqual({
      warnings: [],
      collections: [
        { name: 'servicios', rows: 1, drafts: 0, published: 1, images: 2 },
        { name: 'negocios', rows: 1, drafts: 0, published: 1, images: 1 },
        { name: 'solicitudes', rows: 0, drafts: 0, published: 0, images: 0 },
      ],
      changed: true,
    });
    for (const sheet of ['Servicios', 'Fotos', 'Negocios']) {
      expect(source.written.get(sheet)?.[0]?.values).toEqual([`✅ Sin errores · revisado ${AT}`]);
    }

    expect(await readJson(contentDir, 'servicios')).toEqual([
      expect.objectContaining({
        id: 'fotografia-de-producto',
        cover: './fotografia-de-producto/01.webp',
        gallery: [{ src: './fotografia-de-producto/02.webp', alt: 'Taza con mensaje' }],
      }),
    ]);
    expect(await readJson(contentDir, 'negocios')).toEqual([
      expect.objectContaining({
        id: 'alova',
        url: 'https://alova.desayunosorpresas.com/',
        image: './alova/01.webp',
        featured: true,
        updatedAt: '2026-10-12',
      }),
    ]);
    const cover = await sharp(
      path.join(contentDir, 'servicios', 'fotografia-de-producto', '01.webp'),
    ).metadata();
    expect(cover).toMatchObject({ format: 'webp', width: 2000 });

    const second = await runSync(fakeSource(allSheets(), files), {
      ...options,
      today: '2026-11-01',
    });
    expect(second.changed).toBe(false);
  });

  it('un enlace que no responde es un aviso: publica igual y lo anota en la hoja', async () => {
    const source = fakeSource(allSheets(), await validFiles());
    const report = await runSync(source, {
      ...options,
      checkLink: async () => 'respondió con el código 404',
    });
    expect(report.collections[1]?.published).toBe(1);
    expect(report.warnings).toEqual([
      'Negocios, fila 2: Aviso: "Enlace": la página no responde (respondió con el código 404); revisa que esté publicada.',
    ]);
    expect(source.written.get('Negocios')).toEqual([
      { column: 'I', values: [`🟡 1 aviso (no bloquea) · revisado ${AT}`] },
      {
        column: 'J',
        values: [
          '• Aviso: "Enlace": la página no responde (respondió con el código 404); revisa que esté publicada.',
        ],
      },
    ]);
  });

  it('sin la pestaña Negocios publica los servicios y deja un aviso', async () => {
    const sheets = allSheets();
    sheets.delete('Negocios');
    const report = await runSync(fakeSource(sheets, await validFiles()), options);
    expect(report.collections.map((c) => c.published)).toEqual([1, 0, 0]);
    expect(report.warnings).toEqual([
      'Crea la pestaña "Negocios" para publicar el directorio de negocios.',
    ]);
    expect(await readJson(contentDir, 'negocios')).toEqual([]);
  });

  it('publica solo fecha, grupo y ciudad de las solicitudes marcadas', async () => {
    const sheets = allSheets();
    sheets.set('Solicitudes', [
      [
        'Fecha',
        'Grupo',
        'Nombre',
        'Negocio',
        'Ciudad',
        'Publicar',
        'Errores a corregir',
        'Detalle error',
      ].map((text) => ({ text })),
      ['2026-10-11 09:00', 'Privado', 'Ana Pérez', 'Dulce Amanecer', 'Cali', 'Sí'].map((text) => ({
        text,
      })),
      ['2026-10-11 10:00', 'Público', 'Luis Gómez', '', 'Pasto', ''].map((text) => ({ text })),
    ]);
    const source = fakeSource(sheets, await validFiles());
    const report = await runSync(source, options);
    expect(report.collections[2]).toMatchObject({ rows: 2, drafts: 1, published: 1 });
    expect(await readJson(contentDir, 'solicitudes')).toEqual([
      {
        id: '2026-10-11-fila-2',
        date: '2026-10-11',
        group: 'privado',
        city: 'Cali',
        updatedAt: options.today,
      },
    ]);
    expect(source.written.get('Solicitudes')?.[0]?.values).toEqual([
      `✅ Sin errores · revisado ${AT}`,
      expect.stringContaining('No se publica'),
    ]);
  });

  it('elimina elementos que pasan a borrador y lo anota en la hoja', async () => {
    await mkdir(path.join(contentDir, 'servicios', 'viejo'), { recursive: true });
    await writeFile(path.join(contentDir, 'servicios', 'viejo', '01.webp'), 'x');
    const source = fakeSource(allSheets(servicesGrid({ status: 'Borrador' })), await validFiles());

    const report = await runSync(source, options);
    expect(report.collections[0]).toMatchObject({ drafts: 1, published: 0 });
    expect(await readdir(path.join(contentDir, 'servicios'))).toEqual(['servicios.json']);
    expect(source.written.get('Servicios')?.[0]?.values).toEqual([
      `Borrador: no se publica ni se revisa · revisado ${AT}`,
    ]);
    expect(source.written.get('Fotos')?.[0]?.values).toEqual([
      `Servicio en borrador: no se publica · revisado ${AT}`,
    ]);
  });

  it('escribe los errores de fotos en su fila y no toca el disco', async () => {
    const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', bytes: new Uint8Array([1]) };
    const { [PHOTO]: _missing, ...withoutPhoto } = await validFiles();
    const source = fakeSource(allSheets(), { ...withoutPhoto, [COVER]: heic });

    const error = await failure(source, options);
    expect(error.problems.map(formatProblem)).toEqual([
      expect.stringMatching(/^Servicios, fila 2: "Foto": .*guárdala como JPG/),
      expect.stringMatching(new RegExp(`^Fotos, fila 2: "Foto": Archivo ${PHOTO} no encontrado`)),
    ]);
    expect(source.written.get('Servicios')?.[0]?.values).toEqual([`⚠️ 1 error · revisado ${AT}`]);
    expect(source.written.get('Negocios')?.[0]?.values).toEqual([
      `✅ Sin errores · revisado ${AT}`,
    ]);
    expect(await readdir(contentDir)).toEqual([]);
  });

  it('detecta la misma foto subida dos veces con enlaces distintos', async () => {
    const files = await validFiles();
    const bytes = await jpeg('#f4c27a', 800);
    files[COVER] = { name: 'portada.jpg', mimeType: 'image/jpeg', bytes };
    files[PHOTO] = { name: 'copia.jpg', mimeType: 'image/jpeg', bytes };
    const error = await failure(fakeSource(allSheets(), files), options);
    expect(error.problems.map(formatProblem)).toEqual([
      'Fotos, fila 2: "Foto" es idéntica a la portada (Servicios, fila 2) (mismo archivo subido dos veces); usa otra foto.',
    ]);
  });

  it('si no puede escribir en la hoja, publica igual y lo deja como aviso', async () => {
    const source = fakeSource(allSheets(), await validFiles(), { failWrites: true });
    const report = await runSync(source, options);
    expect(report.collections[0]?.published).toBe(1);
    expect(report.warnings).toHaveLength(3);
    expect(report.warnings[0]).toContain('No se pudo escribir la revisión');
  });

  it('reporta las pestañas obligatorias que faltan', async () => {
    const source = fakeSource(new Map([['Servicios', servicesGrid()]]), {});
    const error = await failure(source, options);
    expect(error.problems[0]).toEqual({ message: 'Falta la pestaña "Fotos".' });
  });
});
