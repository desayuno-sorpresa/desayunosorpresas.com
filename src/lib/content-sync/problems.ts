export const SERVICES_SHEET = 'Servicios';
export const PHOTOS_SHEET = 'Fotos';
export type SheetName = typeof SERVICES_SHEET | typeof PHOTOS_SHEET;

/**
 * Problema detectado en la hoja. Con `sheet` y `row` se escribe en esa fila;
 * solo con `sheet` afecta a toda la pestaña; sin ninguno es general.
 */
export interface Problem {
  message: string;
  sheet?: SheetName;
  row?: number;
}

/** Ubicación de una fila de la hoja. */
export interface RowRef {
  sheet: SheetName;
  row: number;
}

export function rowProblem(at: RowRef, message: string): Problem {
  return { sheet: at.sheet, row: at.row, message };
}

export function describeRow(at: RowRef): string {
  return `${at.sheet}, fila ${at.row}`;
}

/** Texto de una línea para registros e issues: "Servicios, fila 3: …". */
export function formatProblem(problem: Problem): string {
  if (problem.sheet !== undefined && problem.row !== undefined) {
    return `${describeRow({ sheet: problem.sheet, row: problem.row })}: ${problem.message}`;
  }
  return problem.message;
}
