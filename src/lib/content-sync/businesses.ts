import {
  imageFiles,
  stampEntry,
  type CollectionParse,
  type DriveImageRef,
  type RowNote,
} from './collection.ts';
import { reviewAltTexts, reviewTexts } from './content-review.ts';
import { extractDriveFileId } from './drive.ts';
import { BUSINESS_LIMITS, SERVICE_LIMITS, SLUG_PATTERN } from './limits.ts';
import { parseHttpsUrl, parseYesNo } from './links.ts';
import { BUSINESSES_SHEET, rowProblem, type Problem, type RowRef } from './problems.ts';
import { readTable, type SheetGrid } from './sheet.ts';
import { singleLine, slugify } from './text.ts';

const BUSINESS_COLUMNS = [
  'nombre',
  'enlace',
  'descripcion',
  'ciudad',
  'logo_o_foto',
  'descripcion_imagen',
  'estado',
] as const;

/** Negocio publicado tal como sale de la hoja, antes de descargar su imagen. */
export interface BusinessDraft {
  slug: string;
  name: string;
  url: string;
  summary: string;
  city: string;
  featured: boolean;
  order: number;
  image: DriveImageRef;
}

/** Entrada de `negocios.json` (forma que valida el esquema de la colección). */
export interface BusinessEntry {
  id: string;
  name: string;
  url: string;
  summary: string;
  city: string;
  image: string;
  imageAlt: string;
  featured: boolean;
  order: number;
  status: 'publicado';
  updatedAt: string;
}

function lengthError(label: string, value: string, min: number, max: number): string | null {
  if (value.length < min) return `"${label}" es demasiado corto (mínimo ${min} caracteres).`;
  if (value.length > max) {
    return `"${label}" es demasiado largo (${value.length} de ${max} caracteres).`;
  }
  return null;
}

/**
 * Convierte la pestaña "Negocios" en negocios publicados.
 * Si la pestaña aún no existe (grid vacío), no hay negocios ni errores.
 */
export function parseBusinesses(grid: SheetGrid): CollectionParse<BusinessDraft> {
  const problems: Problem[] = [];
  const notes: RowNote[] = [];
  if (grid.length === 0) return { items: [], problems, notes, rows: 0, drafts: 0 };

  const table = readTable(BUSINESSES_SHEET, grid, BUSINESS_COLUMNS);
  problems.push(...table.problems);
  const items: BusinessDraft[] = [];
  const rowBySlug = new Map<string, number>();
  const rowByUrl = new Map<string, number>();
  let drafts = 0;

  for (const record of table.records) {
    const at: RowRef = { sheet: BUSINESSES_SHEET, row: record.row };
    const status = singleLine(record.get('estado').text).toLowerCase();
    if (status === 'borrador') {
      drafts += 1;
      notes.push({ ...at, text: 'Borrador: no se publica ni se revisa' });
      continue;
    }
    if (status !== 'publicado') {
      problems.push(rowProblem(at, '"Estado" debe ser "Publicado" o "Borrador".'));
      continue;
    }

    const errors: string[] = [];
    const name = singleLine(record.get('nombre').text);
    const customSlug = singleLine(record.get('identificador').text);
    const slug = customSlug === '' ? slugify(name) : customSlug;
    const summary = singleLine(record.get('descripcion').text);
    const city = singleLine(record.get('ciudad').text);
    const linkCell = record.get('enlace');
    const link = parseHttpsUrl(linkCell.link ?? linkCell.text);
    const imageCell = record.get('logo_o_foto');
    const fileId = extractDriveFileId(imageCell.link ?? '') ?? extractDriveFileId(imageCell.text);
    const imageAlt = singleLine(record.get('descripcion_imagen').text);
    const featured = parseYesNo(record.get('destacado').text);
    const orderText = record.get('orden').text.trim();
    const order = orderText === '' ? record.row : Number(orderText.replace(',', '.'));

    if (!SLUG_PATTERN.test(slug)) {
      errors.push(
        `"Identificador" solo puede tener minúsculas sin tildes, números y guiones (valor: "${slug}").`,
      );
    } else if (rowBySlug.has(slug)) {
      errors.push(`el identificador "${slug}" ya se usa en la fila ${rowBySlug.get(slug)}.`);
    }
    const { name: n, summary: s, city: c } = BUSINESS_LIMITS;
    for (const message of [
      lengthError('Nombre', name, n.min, n.max),
      lengthError('Descripción', summary, s.min, s.max),
      lengthError('Ciudad', city, c.min, c.max),
    ]) {
      if (message) errors.push(message);
    }
    if (!link.ok) {
      errors.push(`"Enlace" ${link.error}`);
    } else if (rowByUrl.has(link.url)) {
      errors.push(`"Enlace" ya se usa en la fila ${rowByUrl.get(link.url)}.`);
    }
    if (fileId === null)
      errors.push('"Logo o foto" debe ser un enlace de Google Drive a la imagen.');
    if (imageAlt.length < SERVICE_LIMITS.altMin) {
      errors.push(
        `"Descripción imagen" debe describir la imagen (mínimo ${SERVICE_LIMITS.altMin} caracteres).`,
      );
    }
    if (featured === null) errors.push('"Destacado" debe ser "Sí" o "No" (o quedar vacío).');
    if (!Number.isInteger(order)) errors.push('"Orden" debe ser un número entero.');
    errors.push(
      ...reviewTexts([
        { label: 'Nombre', value: name },
        { label: 'Descripción', value: summary },
        { label: 'Ciudad', value: city },
        { label: 'Descripción imagen', value: imageAlt },
      ]),
      ...reviewAltTexts(
        [{ label: 'Descripción imagen', origin: 'la imagen', alt: imageAlt }],
        name,
        summary,
      ).map((problem) => problem.message),
    );

    if (errors.length > 0 || !link.ok || fileId === null || featured === null) {
      problems.push(...errors.map((message) => rowProblem(at, message)));
      continue;
    }
    rowBySlug.set(slug, record.row);
    rowByUrl.set(link.url, record.row);
    items.push({
      slug,
      name,
      url: link.url,
      summary,
      city,
      featured,
      order,
      image: { fileId, alt: imageAlt, source: at },
    });
  }

  return {
    items: items.toSorted((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es')),
    problems,
    notes,
    rows: table.records.length,
    drafts,
  };
}

export function businessImages(business: BusinessDraft): DriveImageRef[] {
  return [business.image];
}

export function buildBusinessEntry(
  business: BusinessDraft,
  previous: BusinessEntry | undefined,
  imagesChanged: boolean,
  today: string,
): BusinessEntry {
  const [image = ''] = imageFiles(business.slug, 1);
  return stampEntry<BusinessEntry>(
    {
      id: business.slug,
      name: business.name,
      url: business.url,
      summary: business.summary,
      city: business.city,
      image,
      imageAlt: business.image.alt,
      featured: business.featured,
      order: business.order,
      status: 'publicado',
    },
    previous,
    imagesChanged,
    today,
  );
}
