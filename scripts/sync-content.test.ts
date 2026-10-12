import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SheetCell, SheetGrid } from '../src/lib/content-sync/sheet';
import type { ContentSource, DriveFile } from './google/client';
import { runSync, SyncError } from './sync-content';

const COVER = 'COVERCOVERCOVERCOVERCOVER01';
const PHOTO = 'PHOTOPHOTOPHOTOPHOTOPHOTO02';

const cells = (values: string[]): SheetCell[] => values.map((text) => ({ text }));

function servicesGrid(overrides: Partial<Record<'title' | 'status' | 'cover', string>> = {}) {
  return [
    cells(['Título', 'Resumen', 'Descripción', 'Estado', 'Portada', 'Descripción portada']),
    cells([
      overrides.title ?? 'Fotografía de producto',
      'Fotos profesionales para tus redes sociales.',
      'Párrafo uno.',
      overrides.status ?? 'Publicado',
      overrides.cover ?? COVER,
      'Bandeja con globos dorados',
    ]),
  ];
}

const photosGrid = [
  cells(['Servicio', 'Foto', 'Descripción foto']),
  cells(['Fotografía de producto', PHOTO, 'Taza con mensaje']),
];

async function jpeg(color: string, width = 3000): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({ create: { width, height: 1000, channels: 3, background: color } })
      .jpeg()
      .toBuffer(),
  );
}

function fakeSource(
  sheets: Map<string, SheetGrid>,
  files: Record<string, DriveFile>,
): ContentSource & { downloads: string[] } {
  const downloads: string[] = [];
  return {
    downloads,
    async readSheets() {
      return sheets;
    },
    async downloadImage(fileId) {
      downloads.push(fileId);
      const file = files[fileId];
      if (!file) throw new Error(`Archivo ${fileId} no encontrado o no compartido.`);
      return file;
    },
  };
}

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(path.join(tmpdir(), 'sync-'));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('runSync', () => {
  it('escribe el JSON y las fotos en WebP redimensionadas, y es idempotente', async () => {
    const files = {
      [COVER]: { name: 'portada.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#f4c27a') },
      [PHOTO]: { name: 'taza.jpg', mimeType: 'image/jpeg', bytes: await jpeg('#9cc9b4', 800) },
    };
    const sheets = new Map<string, SheetGrid>([
      ['Servicios', servicesGrid()],
      ['Fotos', photosGrid],
    ]);

    const first = await runSync(fakeSource(sheets, files), { outDir, today: '2026-10-12' });
    expect(first).toEqual({ rows: 1, drafts: 0, services: 1, images: 2, changed: true });

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

    const second = await runSync(fakeSource(sheets, files), { outDir, today: '2026-11-01' });
    expect(second.changed).toBe(false);
    const again = JSON.parse(await readFile(path.join(outDir, 'servicios.json'), 'utf8'));
    expect(again[0].updatedAt).toBe('2026-10-12');
  });

  it('elimina servicios que pasan a borrador y sus carpetas', async () => {
    await mkdir(path.join(outDir, 'viejo'), { recursive: true });
    await writeFile(path.join(outDir, 'viejo', '01.webp'), 'x');
    await writeFile(path.join(outDir, 'servicios.json'), '[]\n');
    const sheets = new Map<string, SheetGrid>([
      ['Servicios', servicesGrid({ status: 'Borrador' })],
      ['Fotos', photosGrid],
    ]);
    const report = await runSync(fakeSource(sheets, {}), { outDir, today: '2026-10-12' });
    expect(report).toEqual({ rows: 1, drafts: 1, services: 0, images: 0, changed: true });
    expect(await readdir(outDir)).toEqual(['servicios.json']);
  });

  it('no toca el disco si la hoja o una foto tienen problemas', async () => {
    await writeFile(path.join(outDir, 'servicios.json'), '[]\n');
    const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', bytes: new Uint8Array([1]) };
    const sheets = new Map<string, SheetGrid>([
      ['Servicios', servicesGrid()],
      ['Fotos', photosGrid],
    ]);
    const source = fakeSource(sheets, { [COVER]: heic });

    const error = await runSync(source, { outDir, today: '2026-10-12' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect((error as SyncError).problems).toEqual([
      expect.stringContaining('guárdala como JPG'),
      expect.stringContaining(`Archivo ${PHOTO} no encontrado`),
    ]);
    expect(await readdir(outDir)).toEqual(['servicios.json']);
  });

  it('reporta pestañas faltantes', async () => {
    const source = fakeSource(new Map([['Servicios', servicesGrid()]]), {});
    const error = await runSync(source, { outDir, today: '2026-10-12' }).catch((e: unknown) => e);
    expect((error as SyncError).problems[0]).toBe('Falta la pestaña "Fotos".');
  });
});
