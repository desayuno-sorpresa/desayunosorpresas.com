import type { Problem, SheetName } from './problems.ts';
import type { RowNote } from './services.ts';
import { DETAIL_COLUMN, headerNames, isEmptyRow, STATUS_COLUMN, type SheetGrid } from './sheet.ts';

/** Valores de una columna desde la fila 2 hasta la última fila con datos. */
export interface ColumnWrite {
  /** Columna en notación A1 ("A", "K", "AA"). */
  column: string;
  values: string[];
}

/** Índice de columna (0 = A) a letra(s) A1. */
export function columnLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/**
 * Calcula el contenido de "Errores a corregir" y "Detalle error" para cada fila de una pestaña.
 * Devuelve `null` si la pestaña no tiene esas dos columnas.
 */
export function buildStatusWrites(
  sheet: SheetName,
  grid: SheetGrid,
  problems: readonly Problem[],
  notes: readonly RowNote[],
  reviewedAt: string,
): ColumnWrite[] | null {
  const headers = headerNames(grid);
  const statusIndex = headers.indexOf(STATUS_COLUMN);
  const detailIndex = headers.indexOf(DETAIL_COLUMN);
  if (statusIndex === -1 || detailIndex === -1) return null;

  const own = problems.filter((problem) => problem.sheet === sheet);
  // Problemas de toda la pestaña (p. ej. columnas faltantes) se muestran en cada fila.
  const sheetWide = own.filter((problem) => problem.row === undefined).map((p) => p.message);
  const status: string[] = [];
  const detail: string[] = [];

  grid.slice(1).forEach((cells, index) => {
    const row = index + 2;
    if (isEmptyRow(cells, headers)) {
      status.push('');
      detail.push('');
      return;
    }
    const messages = [
      ...sheetWide,
      ...own.filter((problem) => problem.row === row).map((problem) => problem.message),
    ];
    const note = notes.find((item) => item.sheet === sheet && item.row === row);
    if (messages.length > 0) {
      const count = messages.length === 1 ? '1 error' : `${messages.length} errores`;
      status.push(`⚠️ ${count} · revisado ${reviewedAt}`);
      detail.push(messages.map((message) => `• ${message}`).join('\n'));
    } else if (note) {
      status.push(`${note.text} · revisado ${reviewedAt}`);
      detail.push('');
    } else {
      status.push(`✅ Sin errores · revisado ${reviewedAt}`);
      detail.push('');
    }
  });

  return [
    { column: columnLetter(statusIndex), values: status },
    { column: columnLetter(detailIndex), values: detail },
  ];
}
