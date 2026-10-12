import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatProblem } from '../src/lib/content-sync/problems';
import type { SheetCell, SheetGrid } from '../src/lib/content-sync/sheet';
import type { ColumnWrite } from '../src/lib/content-sync/status';
import type { ContentSource, DriveFile } from './google/client';
import { runSync, SyncError, type SyncOptions } from './sync-content';

const COVER = 'COVERCOVERCOVERCOVERCOVER01';
const PHOTO = 'PHOTOPHOTOPHOTOPHOTOPHOTO02';
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
    async readSheets() {
      return sheets;
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

function bothSheets(services: SheetGrid = servicesGrid()): Map<string, SheetGrid> {
  return new Map([
    ['Servicios', services],
    ['Fotos', photosGrid],
  ]);
}

async function validFiles(): Promise<Record<string, DriveFile>> {
  return {
    [COVER]: { name: 'portada.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#f4c27a') },
    [PHOTO]: { name: 'taza.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#9cc9b4', 800) },
  };
}

async function failure(source: ContentSource, options: SyncOptions): Promise<SyncError> {
  const error = await runSync(source, options).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyncError);
  return error as SyncError;
}

let outDir: string;
let options: SyncOptions;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'sync-'));
  options = { outDir, today: '2026-10-12', reviewedAt: AT };
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('runSync', () => {
  it('escribe JSON y fotos WebP, marca la hoja sin errores y es idempotente', async () => {
    const files = await validFiles();
    const source = fakeSource(bothSheets(), files);

    const first = await runSync(source, options);
    expect(first).toEqual({
      warnings: [],
      rows: 1,
      drafts: 0,
      services: 1,
      images: 2,
      changed: true,
    });
    expect(source.written.get('Servicios')).toEqual([
      { column: 'G', values: [`✅ Sin errores · revisado ${AT}`] },
      { column: 'H', values: [''] },
    ]);
    expect(source.written.get('Fotos')?.[0]?.values).toEqual([`✅ Sin errores · revisado ${AT}`]);

    const json = JSON.parse(await readFile(path.join(outDir, 'servicios.json'), 'utf8'));
    expect(json).toEqual([
      expect.objectContaining({
        id: 'fotografia-de-producto',
        cover: './fotografia-de-producto/01.webp',
        gallery: [{ src: './fotografia-de-producto/02.webp', alt: 'Taza con mensaje' }],
        status: 'publicado',
        updatedAt: '2026-10-12',
      }),
    ]);
    const cover = await sharp(path.join(outDir, 'fotografia-de-producto', '01.webp')).metadata();
    expect(cover).toMatchObject({ format: 'webp', width: 2000 });

    const second = await runSync(fakeSource(bothSheets(), files), {
      ...options,
      today: '2026-11-01',
    });
    expect(second.changed).toBe(false);
    const again = JSON.parse(await readFile(path.join(outDir, 'servicios.json'), 'utf8'));
    expect(again[0].updatedAt).toBe('2026-10-12');
  });

  it('elimina servicios que pasan a borrador y lo anota en la hoja', async () => {
    await mkdir(path.join(outDir, 'viejo'), { recursive: true });
    await writeFile(path.join(outDir, 'viejo', '01.webp'), 'x');
    await writeFile(path.join(outDir, 'servicios.json'), '[]\n');
    const source = fakeSource(bothSheets(servicesGrid({ status: 'Borrador' })), {});

    const report = await runSync(source, options);
    expect(report).toMatchObject({ rows: 1, drafts: 1, services: 0, changed: true });
    expect(await readdir(outDir)).toEqual(['servicios.json']);
    expect(source.written.get('Servicios')?.[0]?.values).toEqual([
      `Borrador: no se publica ni se revisa · revisado ${AT}`,
    ]);
    expect(source.written.get('Fotos')?.[0]?.values).toEqual([
      `Servicio en borrador: no se publica · revisado ${AT}`,
    ]);
  });

  it('escribe los errores de fotos en su fila y no toca el disco', async () => {
    await writeFile(path.join(outDir, 'servicios.json'), '[]\n');
    const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', bytes: new Uint8Array([1]) };
    const source = fakeSource(bothSheets(), { [COVER]: heic });

    const error = await failure(source, options);
    expect(error.problems.map(formatProblem)).toEqual([
      expect.stringMatching(/^Servicios, fila 2: "Foto": .*guárdala como JPG/),
      expect.stringMatching(new RegExp(`^Fotos, fila 2: "Foto": Archivo ${PHOTO} no encontrado`)),
    ]);
    expect(source.written.get('Servicios')?.[0]?.values).toEqual([`⚠️ 1 error · revisado ${AT}`]);
    expect(source.written.get('Servicios')?.[1]?.values[0]).toMatch(/^• "Foto": .*JPG/);
    expect(source.written.get('Fotos')?.[1]?.values[0]).toMatch(/no encontrado/);
    expect(await readdir(outDir)).toEqual(['servicios.json']);
  });

  it('detecta la misma foto subida dos veces con enlaces distintos', async () => {
    const bytes = await jpeg('#f4c27a', 800);
    const source = fakeSource(bothSheets(), {
      [COVER]: { name: 'portada.jpg', mimeType: 'image/jpeg', bytes },
      [PHOTO]: { name: 'copia.jpg', mimeType: 'image/jpeg', bytes },
    });
    const error = await failure(source, options);
    expect(error.problems.map(formatProblem)).toEqual([
      'Fotos, fila 2: "Foto" es idéntica a la portada (Servicios, fila 2) (mismo archivo subido dos veces); usa otra foto.',
    ]);
    expect(await readdir(outDir)).toEqual([]);
  });

  it('si no puede escribir en la hoja, publica igual y lo deja como aviso', async () => {
    const source = fakeSource(bothSheets(), await validFiles(), { failWrites: true });
    const report = await runSync(source, options);
    expect(report.services).toBe(1);
    expect(report.warnings).toEqual([
      expect.stringContaining('No se pudo escribir la revisión'),
      expect.stringContaining('No se pudo escribir la revisión'),
    ]);
  });

  it('avisa si una pestaña no tiene las columnas de revisión', async () => {
    const plainPhotos: SheetGrid = [
      cells(['Servicio', 'Foto', 'Descripción foto']),
      cells(['Fotografía de producto', PHOTO, 'Taza con mensaje']),
    ];
    const sheets = new Map([
      ['Servicios', servicesGrid()],
      ['Fotos', plainPhotos],
    ]);
    const report = await runSync(fakeSource(sheets, await validFiles()), options);
    expect(report.warnings).toEqual([
      'Pestaña "Fotos": agrega las columnas "Errores a corregir" y "Detalle error" para ver ahí la revisión.',
    ]);
  });

  it('reporta pestañas faltantes', async () => {
    const source = fakeSource(new Map([['Servicios', servicesGrid()]]), {});
    const error = await failure(source, options);
    expect(error.problems[0]).toEqual({ message: 'Falta la pestaña "Fotos".' });
  });
});
