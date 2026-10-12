import { imageName, type CollectionParse, type DriveImageRef, type RowNote } from './collection.ts';
import { reviewAltTexts, reviewTexts } from './content-review.ts';
import { extractDriveFileId } from './drive.ts';
import { SERVICE_LIMITS, SLUG_PATTERN } from './limits.ts';
import { PHOTOS_SHEET, rowProblem, SERVICES_SHEET, type Problem, type RowRef } from './problems.ts';
import { readTable, type SheetCell, type SheetGrid } from './sheet.ts';
import { parsePrice, singleLine, slugify, splitLines } from './text.ts';

export { PHOTOS_SHEET, SERVICES_SHEET } from './problems.ts';

const SERVICE_COLUMNS = [
  'titulo',
  'resumen',
  'descripcion',
  'estado',
  'portada',
  'descripcion_portada',
] as const;
const PHOTO_COLUMNS = ['servicio', 'foto', 'descripcion_foto'] as const;

/** Servicio publicado tal como sale de la hoja, antes de descargar imágenes. */
export interface ServiceDraft {
  slug: string;
  title: string;
  summary: string;
  description: string[];
  benefits: string[];
  priceFrom?: number;
  order: number;
  ctaLabel?: string;
  cover: DriveImageRef;
  gallery: DriveImageRef[];
}

function driveId(cell: SheetCell): string | null {
  return extractDriveFileId(cell.link ?? '') ?? extractDriveFileId(cell.text);
}

function lengthError(label: string, value: string, min: number, max: number): string | null {
  if (value.length < min) return `"${label}" es demasiado corto (mínimo ${min} caracteres).`;
  if (value.length > max) {
    return `"${label}" es demasiado largo (${value.length} de ${max} caracteres).`;
  }
  return null;
}

function parseOrder(text: string, fallback: number): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return fallback;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isInteger(value) ? value : null;
}

/**
 * Convierte las pestañas "Servicios" y "Fotos" en servicios publicados.
 * Las filas en estado "Borrador" no se publican ni se revisan (el repositorio es público).
 */
export function parseServices(
  servicesGrid: SheetGrid,
  photosGrid: SheetGrid,
): CollectionParse<ServiceDraft> {
  const problems: Problem[] = [];
  const notes: RowNote[] = [];
  const servicesTable = readTable(SERVICES_SHEET, servicesGrid, SERVICE_COLUMNS);
  // La pestaña de fotos puede estar vacía si ningún servicio tiene galería.
  const photosTable =
    photosGrid.length === 0
      ? { records: [], problems: [] }
      : readTable(PHOTOS_SHEET, photosGrid, PHOTO_COLUMNS);
  problems.push(...servicesTable.problems, ...photosTable.problems);

  const services: ServiceDraft[] = [];
  const draftSlugs = new Set<string>();
  const rowBySlug = new Map<string, number>();

  for (const record of servicesTable.records) {
    const at: RowRef = { sheet: SERVICES_SHEET, row: record.row };
    const rowErrors: string[] = [];
    const title = singleLine(record.get('titulo').text);
    const status = singleLine(record.get('estado').text).toLowerCase();
    const customSlug = singleLine(record.get('identificador').text);
    const slug = customSlug === '' ? slugify(title) : customSlug;

    if (status === 'borrador') {
      draftSlugs.add(slug);
      notes.push({ ...at, text: 'Borrador: no se publica ni se revisa' });
      continue;
    }
    if (status !== 'publicado') {
      problems.push(rowProblem(at, '"Estado" debe ser "Publicado" o "Borrador".'));
      continue;
    }

    if (!SLUG_PATTERN.test(slug)) {
      rowErrors.push(
        `"Identificador" solo puede tener minúsculas sin tildes, números y guiones (valor: "${slug}").`,
      );
    } else if (rowBySlug.has(slug)) {
      rowErrors.push(`el identificador "${slug}" ya se usa en la fila ${rowBySlug.get(slug)}.`);
    }

    const summary = singleLine(record.get('resumen').text);
    const description = splitLines(record.get('descripcion').text);
    const benefits = splitLines(record.get('beneficios').text);
    const price = parsePrice(record.get('precio_desde').text);
    const order = parseOrder(record.get('orden').text, record.row);
    const ctaLabel = singleLine(record.get('texto_boton').text);
    const coverId = driveId(record.get('portada'));
    const coverAlt = singleLine(record.get('descripcion_portada').text);

    const { title: t, summary: s, ctaLabel: c, altMin } = SERVICE_LIMITS;
    for (const message of [
      lengthError('Título', title, t.min, t.max),
      lengthError('Resumen', summary, s.min, s.max),
      ctaLabel === '' ? null : lengthError('Texto botón', ctaLabel, c.min, c.max),
    ]) {
      if (message) rowErrors.push(message);
    }
    if (description.length === 0) rowErrors.push('"Descripción" está vacía.');
    if (price === null) rowErrors.push('"Precio desde" debe ser un número, p. ej. 150000.');
    if (order === null) rowErrors.push('"Orden" debe ser un número entero.');
    if (coverId === null) rowErrors.push('"Portada" debe ser un enlace de Google Drive a la foto.');
    if (coverAlt.length < altMin) {
      rowErrors.push(`"Descripción portada" debe describir la foto (mínimo ${altMin} caracteres).`);
    }
    rowErrors.push(
      ...reviewTexts([
        { label: 'Título', value: title },
        { label: 'Resumen', value: summary },
        { label: 'Descripción', value: description.join('\n') },
        { label: 'Beneficios', value: benefits.join('\n') },
        { label: 'Texto botón', value: ctaLabel },
        { label: 'Descripción portada', value: coverAlt },
      ]),
    );

    if (rowErrors.length > 0 || coverId === null || order === null || price === null) {
      problems.push(...rowErrors.map((message) => rowProblem(at, message)));
      continue;
    }

    rowBySlug.set(slug, record.row);
    services.push({
      slug,
      title,
      summary,
      description,
      benefits,
      ...(price === undefined ? {} : { priceFrom: price }),
      order,
      ...(ctaLabel === '' ? {} : { ctaLabel }),
      cover: { fileId: coverId, alt: coverAlt, source: at },
      gallery: [],
    });
  }

  const bySlug = new Map(services.map((service) => [service.slug, service]));
  const titleToSlug = new Map(services.map((service) => [slugify(service.title), service.slug]));
  const photos: { slug: string; order: number; ref: DriveImageRef }[] = [];

  for (const record of photosTable.records) {
    const at: RowRef = { sheet: PHOTOS_SHEET, row: record.row };
    const reference = slugify(record.get('servicio').text);
    const slug = bySlug.has(reference) ? reference : titleToSlug.get(reference);
    if (slug === undefined) {
      if (draftSlugs.has(reference)) {
        notes.push({ ...at, text: 'Servicio en borrador: no se publica' });
      } else {
        problems.push(
          rowProblem(
            at,
            `"Servicio": no existe un servicio publicado llamado "${record.get('servicio').text}" (o tiene errores).`,
          ),
        );
      }
      continue;
    }
    const fileId = driveId(record.get('foto'));
    const alt = singleLine(record.get('descripcion_foto').text);
    const order = parseOrder(record.get('orden').text, record.row);
    const rowErrors: string[] = [];
    if (fileId === null) rowErrors.push('"Foto" debe ser un enlace de Google Drive.');
    if (alt.length < SERVICE_LIMITS.altMin) {
      rowErrors.push(
        `"Descripción foto" debe describir la foto (mínimo ${SERVICE_LIMITS.altMin} caracteres).`,
      );
    }
    if (order === null) rowErrors.push('"Orden" debe ser un número entero.');
    rowErrors.push(...reviewTexts([{ label: 'Descripción foto', value: alt }]));
    if (rowErrors.length > 0 || fileId === null || order === null) {
      problems.push(...rowErrors.map((message) => rowProblem(at, message)));
      continue;
    }
    photos.push({ slug, order, ref: { fileId, alt, source: at } });
  }

  for (const photo of photos.toSorted((a, b) => a.order - b.order)) {
    bySlug.get(photo.slug)?.gallery.push(photo.ref);
  }

  // Revisión de las fotos de cada servicio en conjunto: repetidas y descripciones.
  for (const service of services) {
    const images = [service.cover, ...service.gallery];
    const firstUse = new Map<string, DriveImageRef>();
    for (const ref of images) {
      const previous = firstUse.get(ref.fileId);
      if (previous) {
        problems.push(
          rowProblem(
            ref.source,
            `"Foto" es la misma imagen que ${imageName(previous)}; usa otra foto.`,
          ),
        );
      } else {
        firstUse.set(ref.fileId, ref);
      }
    }
    const altProblems = reviewAltTexts(
      images.map((ref) => ({
        label: ref.source.sheet === SERVICES_SHEET ? 'Descripción portada' : 'Descripción foto',
        origin: imageName(ref),
        alt: ref.alt,
      })),
      service.title,
      service.summary,
    );
    for (const { index, message } of altProblems) {
      const ref = images[index];
      if (ref) problems.push(rowProblem(ref.source, message));
    }
  }

  return {
    items: services.toSorted((a, b) => a.order - b.order),
    problems,
    notes,
    rows: servicesTable.records.length,
    drafts: draftSlugs.size,
  };
}
