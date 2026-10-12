// Sincroniza los servicios desde Google Sheets + Drive hacia src/content/servicios/.
// Uso: GOOGLE_SERVICE_ACCOUNT_JSON='…' SPREADSHEET_ID='…' pnpm sync:content
import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildEntry, imagePaths, type ServiceEntry } from '../src/lib/content-sync/entries.ts';
import {
  formatProblem,
  rowProblem,
  type Problem,
  type SheetName,
} from '../src/lib/content-sync/problems.ts';
import {
  parseServices,
  photoName,
  PHOTOS_SHEET,
  SERVICES_SHEET,
  type DriveImageRef,
  type RowNote,
} from '../src/lib/content-sync/services.ts';
import type { SheetGrid } from '../src/lib/content-sync/sheet.ts';
import { buildStatusWrites } from '../src/lib/content-sync/status.ts';
import { getAccessToken, parseServiceAccount } from './google/auth.ts';
import { createGoogleSource, SCOPES, type ContentSource } from './google/client.ts';

export const DEFAULT_OUT_DIR = 'src/content/servicios';
const JSON_FILE = 'servicios.json';
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface SyncOptions {
  outDir: string;
  /** Fecha YYYY-MM-DD para servicios nuevos o modificados. */
  today: string;
  /** Fecha y hora que se anota en la hoja junto al resultado de la revisión. */
  reviewedAt: string;
}

export interface SyncReport {
  /** Avisos que no bloquean la publicación (p. ej. no se pudo escribir la revisión). */
  warnings: string[];
  rows: number;
  drafts: number;
  services: number;
  images: number;
  changed: boolean;
}

export class SyncError extends Error {
  readonly problems: readonly Problem[];
  readonly warnings: readonly string[];

  constructor(problems: readonly Problem[], warnings: readonly string[] = []) {
    super(`La hoja tiene ${problems.length} problema(s).`);
    this.problems = problems;
    this.warnings = warnings;
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

/**
 * Escribe el resultado de la revisión en "Errores a corregir" / "Detalle error" de cada pestaña.
 * Devuelve avisos si no puede: no bloquean la publicación ni ocultan los demás errores.
 */
async function writeReview(
  source: ContentSource,
  sheets: Map<string, SheetGrid>,
  problems: readonly Problem[],
  notes: readonly RowNote[],
  reviewedAt: string,
): Promise<string[]> {
  const warnings: string[] = [];
  for (const sheet of [SERVICES_SHEET, PHOTOS_SHEET] satisfies SheetName[]) {
    const grid = sheets.get(sheet);
    if (!grid) continue;
    const writes = buildStatusWrites(sheet, grid, problems, notes, reviewedAt);
    if (writes === null) {
      warnings.push(
        `Pestaña "${sheet}": agrega las columnas "Errores a corregir" y "Detalle error" para ver ahí la revisión.`,
      );
      continue;
    }
    try {
      await source.writeColumns(sheet, writes);
    } catch (error) {
      warnings.push(`No se pudo escribir la revisión en la hoja: ${(error as Error).message}`);
    }
  }
  return warnings;
}

export async function runSync(source: ContentSource, options: SyncOptions): Promise<SyncReport> {
  const sheets = await source.readSheets([SERVICES_SHEET, PHOTOS_SHEET]);
  const { services, problems, notes, rows, drafts } = parseServices(
    sheets.get(SERVICES_SHEET) ?? [],
    sheets.get(PHOTOS_SHEET) ?? [],
  );
  for (const sheet of [PHOTOS_SHEET, SERVICES_SHEET]) {
    if (!sheets.has(sheet)) problems.unshift({ message: `Falta la pestaña "${sheet}".` });
  }

  // Descarga y convierte todo antes de tocar el disco: si algo falla, no queda a medias.
  const rendered = new Map<string, Uint8Array[]>();
  if (problems.length === 0) {
    for (const service of services) {
      const refs = [service.cover, ...service.gallery];
      const images: Uint8Array[] = [];
      for (const ref of refs) {
        try {
          images.push(await toWebp(ref, source));
        } catch (error) {
          problems.push(rowProblem(ref.source, `"Foto": ${(error as Error).message}`));
        }
      }
      rendered.set(service.slug, images);

      // La misma foto subida dos veces a Drive (enlaces distintos, imagen idéntica).
      // Solo si todas se descargaron; si no, los índices no corresponden a las filas.
      if (images.length !== refs.length) continue;
      images.forEach((image, index) => {
        const twin = images.findIndex(
          (other, otherIndex) => otherIndex < index && sameBytes(other, image),
        );
        const ref = refs[index];
        const original = refs[twin];
        if (twin !== -1 && ref && original) {
          problems.push(
            rowProblem(
              ref.source,
              `"Foto" es idéntica a ${photoName(original)} (mismo archivo subido dos veces); usa otra foto.`,
            ),
          );
        }
      });
    }
  }

  const warnings = await writeReview(source, sheets, problems, notes, options.reviewedAt);
  if (problems.length > 0) throw new SyncError(problems, warnings);

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

  return { warnings, rows, drafts, services: entries.length, images: imageCount, changed };
}

function nowInBogota(): { today: string; reviewedAt: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  return { today, reviewedAt: `${today} ${get('hour')}:${get('minute')}` };
}

async function appendToFiles(files: readonly (string | undefined)[], text: string): Promise<void> {
  for (const file of files) if (file) await appendFile(file, text);
}

function bulletList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
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
    ...nowInBogota(),
  });
  const message =
    `Filas leídas en "Servicios": ${report.rows} (${report.drafts} en borrador). ` +
    `Publicados: ${report.services}, fotos: ${report.images}. ` +
    (report.changed ? 'Hay cambios.' : 'Sin cambios.');
  console.log(message);
  for (const warning of report.warnings) console.warn(`Aviso: ${warning}`);
  const warnings =
    report.warnings.length > 0 ? `\n\n**Avisos:**\n\n${bulletList(report.warnings)}` : '';
  await appendToFiles([process.env['GITHUB_STEP_SUMMARY']], `${message}${warnings}\n\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (error: unknown) => {
    const problems =
      error instanceof SyncError
        ? error.problems
        : [{ message: error instanceof Error ? error.message : String(error) }];
    const warnings = error instanceof SyncError ? error.warnings : [];
    const title =
      error instanceof SyncError
        ? `${error.message} Corrígelos en Google Sheets:`
        : 'No se pudo sincronizar:';
    console.error(title);
    for (const problem of problems) console.error(`  - ${formatProblem(problem)}`);
    for (const warning of warnings) console.warn(`Aviso: ${warning}`);

    // Resumen de la ejecución: lista completa.
    const all = bulletList(problems.map(formatProblem));
    const notice = warnings.length > 0 ? `\n\n**Avisos:**\n\n${bulletList(warnings)}` : '';
    await appendToFiles([process.env['GITHUB_STEP_SUMMARY']], `### ${title}\n\n${all}${notice}\n`);

    // Issue (público): los errores de filas se corrigen en la hoja; aquí solo se resumen.
    const inRows = problems.filter((problem) => problem.row !== undefined).length;
    const general = problems.filter((problem) => problem.row === undefined).map(formatProblem);
    const lines = [
      ...(inRows > 0 && warnings.length === 0
        ? [
            `Hay **${inRows} error(es)** en filas de la hoja. Revisa las columnas **Errores a corregir** y **Detalle error** de las pestañas "${SERVICES_SHEET}" y "${PHOTOS_SHEET}".`,
          ]
        : []),
      // Si no se pudo escribir en la hoja, la lista completa va en el issue.
      ...(inRows > 0 && warnings.length > 0
        ? ['No se pudo escribir la revisión en la hoja. Errores:', '', all]
        : []),
      ...(general.length > 0 ? ['', bulletList(general)] : []),
      ...(warnings.length > 0 ? ['', '**Avisos:**', '', bulletList(warnings)] : []),
    ];
    await appendToFiles([process.env['SYNC_PROBLEMS_FILE']], `${lines.join('\n')}\n`);
    process.exit(1);
  });
}
