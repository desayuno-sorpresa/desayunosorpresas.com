import { normalizeHeader } from './text.ts';

/** Celda de Google Sheets: texto visible y, si existe, el enlace (hipervínculo o chip de Drive). */
export interface SheetCell {
  text: string;
  link?: string;
}

export type SheetGrid = readonly (readonly SheetCell[])[];

export interface SheetRecord {
  /** Número de fila tal como se ve en Google Sheets (el encabezado es la fila 1). */
  row: number;
  get(column: string): SheetCell;
}

export interface TableResult {
  records: SheetRecord[];
  errors: string[];
}

const EMPTY: SheetCell = { text: '' };

/** Convierte una pestaña (primera fila = encabezados) en registros; ignora filas vacías. */
export function readTable(
  sheetName: string,
  grid: SheetGrid,
  requiredColumns: readonly string[],
): TableResult {
  const [headerRow = [], ...rows] = grid;
  const headers = headerRow.map((cell) => normalizeHeader(cell.text));
  const missing = requiredColumns.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return {
      records: [],
      errors: [
        `Pestaña "${sheetName}": faltan las columnas ${missing.map((m) => `"${m}"`).join(', ')}.`,
      ],
    };
  }

  const records: SheetRecord[] = [];
  rows.forEach((cells, index) => {
    if (cells.every((cell) => cell.text.trim() === '' && !cell.link)) return;
    records.push({
      row: index + 2,
      get(column) {
        const position = headers.indexOf(column);
        return position === -1 ? EMPTY : (cells[position] ?? EMPTY);
      },
    });
  });
  return { records, errors: [] };
}
