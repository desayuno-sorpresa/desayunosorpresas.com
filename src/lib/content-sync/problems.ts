export const SERVICES_SHEET = 'Servicios';
export const PHOTOS_SHEET = 'Fotos';
export const BUSINESSES_SHEET = 'Negocios';
export type SheetName = typeof SERVICES_SHEET | typeof PHOTOS_SHEET | typeof BUSINESSES_SHEET;
export const ALL_SHEETS: readonly SheetName[] = [SERVICES_SHEET, PHOTOS_SHEET, BUSINESSES_SHEET];

/**
 * Problema detectado en la hoja. Con `sheet` y `row` se escribe en esa fila;
 * solo con `sheet` afecta a toda la pestaña; sin ninguno es general.
 * Los avisos (`warning`) se muestran pero no bloquean la publicación.
 */
export interface Problem {
  message: string;
  sheet?: SheetName;
  row?: number;
  warning?: boolean;
}

/** Ubicación de una fila de la hoja. */
export interface RowRef {
  sheet: SheetName;
  row: number;
}

export function rowProblem(at: RowRef, message: string): Problem {
  return { sheet: at.sheet, row: at.row, message };
}

export function rowWarning(at: RowRef, message: string): Problem {
  return { ...rowProblem(at, message), warning: true };
}

export function isBlocking(problem: Problem): boolean {
  return problem.warning !== true;
}

export function describeRow(at: RowRef): string {
  return `${at.sheet}, fila ${at.row}`;
}

/** Texto de una línea para registros e issues: "Servicios, fila 3: …". */
export function formatProblem(problem: Problem): string {
  const prefix = problem.warning ? 'Aviso: ' : '';
  if (problem.sheet !== undefined && problem.row !== undefined) {
    return `${describeRow({ sheet: problem.sheet, row: problem.row })}: ${prefix}${problem.message}`;
  }
  return `${prefix}${problem.message}`;
}
