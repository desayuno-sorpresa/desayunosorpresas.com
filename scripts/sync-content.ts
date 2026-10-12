// Sincroniza los servicios desde Google Sheets + Drive hacia src/content/servicios/.
// Uso: GOOGLE_SERVICE_ACCOUNT_JSON='…' SPREADSHEET_ID='…' pnpm sync:content
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildEntry, imagePaths, type ServiceEntry } from '../src/lib/content-sync/entries.ts';
import {
  parseServices,
  PHOTOS_SHEET,
  SERVICES_SHEET,
  type DriveImageRef,
} from '../src/lib/content-sync/services.ts';
import { getAccessToken, parseServiceAccount } from './google/auth.ts';
import { createGoogleSource, SCOPES, type ContentSource } from './google/client.ts';

export const DEFAULT_OUT_DIR = 'src/content/servicios';
const JSON_FILE = 'servicios.json';
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface SyncOptions {
  outDir: string;
  /** Fecha YYYY-MM-DD para servicios nuevos o modificados. */
  today: string;
}

export interface SyncReport {
  services: number;
  images: number;
  changed: boolean;
}

export class SyncError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`La hoja tiene ${problems.length} problema(s).`);
    this.problems = problems;
  }
}

/** Foto de Drive → WebP sin metadatos (EXIF/GPS), orientación corregida, máx. 2000 px. */
async function toWebp(ref: DriveImageRef, source: ContentSource): Promise<Uint8Array> {
  const file = await source.downloadImage(ref.fileId);
  if (!SUPPORTED_TYPES.has(file.mimeType)) {
    throw new Error(
      `La foto "${file.name}" (${file.mimeType || 'tipo desconocido'}) no es JPG, PNG, WebP ni AVIF. ` +
        'Si es HEIC (iPhone), guárdala como JPG y vuelve a subirla.',
    );
  }
  const output = await sharp(file.bytes)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(output);
}

async function readPrevious(file: string): Promise<Map<string, ServiceEntry>> {
  try {
    const entries = JSON.parse(await readFile(file, 'utf8')) as ServiceEntry[];
    return new Map(entries.map((entry) => [entry.id, entry]));
  } catch {
    return new Map();
  }
}

async function readIfExists(file: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(file));
  } catch {
    return null;
  }
}

function sameBytes(a: Uint8Array | null, b: Uint8Array): boolean {
  return a !== null && Buffer.from(a).equals(Buffer.from(b));
}

export async function runSync(source: ContentSource, options: SyncOptions): Promise<SyncReport> {
  const sheets = await source.readSheets([SERVICES_SHEET, PHOTOS_SHEET]);
  const { services, errors } = parseServices(
    sheets.get(SERVICES_SHEET) ?? [],
    sheets.get(PHOTOS_SHEET) ?? [],
  );
  if (!sheets.has(SERVICES_SHEET)) errors.unshift(`Falta la pestaña "${SERVICES_SHEET}".`);
  if (!sheets.has(PHOTOS_SHEET)) errors.unshift(`Falta la pestaña "${PHOTOS_SHEET}".`);
  if (errors.length > 0) throw new SyncError(errors);

  // Descarga y convierte todo antes de tocar el disco: si algo falla, no queda a medias.
  const imageProblems: string[] = [];
  const rendered = new Map<string, Uint8Array[]>();
  for (const service of services) {
    const images: Uint8Array[] = [];
    for (const ref of [service.cover, ...service.gallery]) {
      try {
        images.push(await toWebp(ref, source));
      } catch (error) {
        imageProblems.push(`Servicio "${service.title}": ${(error as Error).message}`);
      }
    }
    rendered.set(service.slug, images);
  }
  if (imageProblems.length > 0) throw new SyncError(imageProblems);

  const jsonPath = path.join(options.outDir, JSON_FILE);
  const previous = await readPrevious(jsonPath);
  const previousJson = await readFile(jsonPath, 'utf8').catch(() => '');
  let changed = false;
  let imageCount = 0;
  const entries: ServiceEntry[] = [];

  for (const service of services) {
    const paths = imagePaths(service);
    const files = [paths.cover, ...paths.gallery];
    const images = rendered.get(service.slug) ?? [];
    const serviceDir = path.join(options.outDir, service.slug);
    let imagesChanged = false;

    // Comparar con lo existente también detecta fotos sobrantes de una versión anterior.
    const existingFiles = await readdir(serviceDir).catch(() => [] as string[]);
    const expectedNames = new Set(files.map((file) => path.basename(file)));
    if (existingFiles.some((name) => !expectedNames.has(name))) imagesChanged = true;

    for (const [index, relative] of files.entries()) {
      const bytes = images[index];
      if (bytes === undefined) continue;
      const target = path.join(options.outDir, relative);
      if (!sameBytes(await readIfExists(target), bytes)) imagesChanged = true;
    }

    if (imagesChanged) {
      await rm(serviceDir, { recursive: true, force: true });
      await mkdir(serviceDir, { recursive: true });
      for (const [index, relative] of files.entries()) {
        const bytes = images[index];
        if (bytes !== undefined) await writeFile(path.join(options.outDir, relative), bytes);
      }
      changed = true;
    }
    imageCount += files.length;
    entries.push(buildEntry(service, previous.get(service.slug), imagesChanged, options.today));
  }

  // Elimina carpetas de servicios que ya no están publicados.
  const keep = new Set(services.map((service) => service.slug));
  for (const item of await readdir(options.outDir, { withFileTypes: true }).catch(() => [])) {
    if (item.isDirectory() && !keep.has(item.name)) {
      await rm(path.join(options.outDir, item.name), { recursive: true, force: true });
      changed = true;
    }
  }

  const nextJson = `${JSON.stringify(entries, null, 2)}\n`;
  if (nextJson !== previousJson) {
    await mkdir(options.outDir, { recursive: true });
    await writeFile(jsonPath, nextJson);
    changed = true;
  }

  return { services: entries.length, images: imageCount, changed };
}

function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

async function main(): Promise<void> {
  const credentials = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
  const spreadsheetId = process.env['SPREADSHEET_ID'];
  if (!credentials || !spreadsheetId) {
    throw new Error('Faltan las variables GOOGLE_SERVICE_ACCOUNT_JSON y/o SPREADSHEET_ID.');
  }
  const account = parseServiceAccount(credentials);
  const token = await getAccessToken(account, SCOPES);
  const report = await runSync(createGoogleSource(spreadsheetId, token, account.clientEmail), {
    outDir: DEFAULT_OUT_DIR,
    today: todayInBogota(),
  });
  console.log(
    `${report.services} servicio(s) publicado(s), ${report.images} foto(s). ` +
      (report.changed ? 'Hay cambios.' : 'Sin cambios.'),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (error: unknown) => {
    if (error instanceof SyncError) {
      console.error(`${error.message} Corrígelos en Google Sheets:`);
      for (const problem of error.problems) console.error(`  - ${problem}`);
      // En GitHub Actions, la lista aparece también en el resumen de la ejecución.
      const summary = process.env['GITHUB_STEP_SUMMARY'];
      if (summary) {
        const list = error.problems.map((problem) => `- ${problem}`).join('\n');
        await appendFile(summary, `### ${error.message} Corrígelos en Google Sheets\n\n${list}\n`);
      }
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exit(1);
  });
}
