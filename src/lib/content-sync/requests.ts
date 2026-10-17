import type { GroupId } from '../join-request.ts';
import { parseIsoDate, relativeDay } from '../recent-requests.ts';
import { stampEntry, type CollectionParse, type RowNote } from './collection.ts';
import { reviewTexts } from './content-review.ts';
import { REQUEST_LIMITS } from './limits.ts';
import { parseYesNo } from './links.ts';
import { REQUESTS_SHEET, rowProblem, type Problem, type RowRef } from './problems.ts';
import { readTable, type SheetGrid } from './sheet.ts';
import { singleLine, stripAccents } from './text.ts';

// Solo se leen estas columnas: nombre, negocio y contacto nunca salen de la hoja.
const REQUEST_COLUMNS = ['fecha', 'grupo', 'ciudad', 'publicar'] as const;

/** Solicitud marcada para publicar, ya validada. */
export interface RequestDraft {
  id: string;
  date: string;
  group: GroupId;
  city: string;
}

/** Entrada de `solicitudes.json` (forma que valida el esquema de la colección). */
export interface RequestEntry extends RequestDraft {
  updatedAt: string;
}

/**
 * Fecha de la celda "Fecha": el Apps Script escribe "2026-10-17 08:15";
 * también se acepta "17/10/2026" si alguien la escribe a mano.
 */
export function parseRequestDate(text: string): string | null {
  const value = singleLine(text);
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(value);
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: \d{1,2}:\d{2}(?::\d{2})?)?$/.exec(value);
  let date: string | null = null;
  if (iso?.[1]) date = iso[1];
  else if (local) {
    const [, day = '', month = '', year = ''] = local;
    date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return date !== null && parseIsoDate(date) !== null ? date : null;
}

function parseGroup(text: string): GroupId | null {
  const value = stripAccents(singleLine(text)).toLowerCase();
  if (value === 'privado') return 'privado';
  if (value === 'publico') return 'publico';
  return null;
}

/**
 * Convierte la pestaña "Solicitudes" en avisos anónimos: solo las filas con "Publicar" = Sí
 * de los últimos días. Los mensajes de error nunca citan datos de la persona.
 */
export function parseRequests(grid: SheetGrid, today: string): CollectionParse<RequestDraft> {
  const problems: Problem[] = [];
  const notes: RowNote[] = [];
  if (grid.length === 0) return { items: [], problems, notes, rows: 0, drafts: 0 };

  const table = readTable(REQUESTS_SHEET, grid, REQUEST_COLUMNS);
  problems.push(...table.problems);
  const items: RequestDraft[] = [];
  let drafts = 0;

  for (const record of table.records) {
    const at: RowRef = { sheet: REQUESTS_SHEET, row: record.row };
    const publish = parseYesNo(record.get('publicar').text);
    if (publish === null) {
      problems.push(rowProblem(at, '"Publicar" debe ser "Sí" o "No" (o quedar vacío).'));
      continue;
    }
    if (!publish) {
      drafts += 1;
      notes.push({ ...at, text: 'No se publica: escribe "Sí" en "Publicar" para mostrarla' });
      continue;
    }

    const errors: string[] = [];
    const date = parseRequestDate(record.get('fecha').text);
    const group = parseGroup(record.get('grupo').text);
    const city = singleLine(record.get('ciudad').text);
    const { min, max } = REQUEST_LIMITS.city;

    if (date === null) errors.push('"Fecha" debe tener el formato 2026-10-17 o 17/10/2026.');
    if (group === null) errors.push('"Grupo" debe ser "Público" o "Privado".');
    if (city.length < min) errors.push(`"Ciudad" es demasiado corta (mínimo ${min} caracteres).`);
    if (city.length > max) errors.push(`"Ciudad" es demasiado larga (máximo ${max} caracteres).`);
    errors.push(...reviewTexts([{ label: 'Ciudad', value: city }]));

    if (errors.length > 0 || date === null || group === null) {
      problems.push(...errors.map((message) => rowProblem(at, message)));
      continue;
    }
    if (relativeDay(date, today, REQUEST_LIMITS.days) === null) {
      notes.push({ ...at, text: `No se muestra: tiene más de ${REQUEST_LIMITS.days} días` });
      continue;
    }
    items.push({ id: `${date}-fila-${record.row}`, date, group, city });
  }

  return {
    items: items
      .toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, REQUEST_LIMITS.max),
    problems,
    notes,
    rows: table.records.length,
    drafts,
  };
}

export function buildRequestEntry(
  request: RequestDraft,
  previous: RequestEntry | undefined,
  _imagesChanged: boolean,
  today: string,
): RequestEntry {
  return stampEntry<RequestEntry>({ ...request }, previous, false, today);
}
