import { describe, expect, it } from 'vitest';
import { formatProblem } from './problems';
import { buildRequestEntry, parseRequestDate, parseRequests } from './requests';
import type { SheetCell, SheetGrid } from './sheet';

const TODAY = '2026-10-17';
const HEADERS = [
  'Fecha',
  'Grupo',
  'Nombre',
  'Negocio',
  'Ciudad',
  'Instagram, web o catálogo',
  'Publicar',
  'Errores a corregir',
  'Detalle error',
];

const row = (values: string[]): SheetCell[] => values.map((text) => ({ text }));
const grid = (...rows: string[][]): SheetGrid => [row(HEADERS), ...rows.map(row)];
const request = (overrides: Partial<Record<'fecha' | 'grupo' | 'ciudad' | 'publicar', string>>) => [
  overrides.fecha ?? '2026-10-16 09:30',
  overrides.grupo ?? 'Privado',
  'Ana Pérez',
  'Dulce Amanecer',
  overrides.ciudad ?? 'Medellín',
  '@dulceamanecer',
  overrides.publicar ?? 'Sí',
];

describe('parseRequestDate', () => {
  it('acepta la fecha del Apps Script y la escrita a mano', () => {
    expect(parseRequestDate('2026-10-16 09:30')).toBe('2026-10-16');
    expect(parseRequestDate('2026-10-16')).toBe('2026-10-16');
    expect(parseRequestDate('6/10/2026')).toBe('2026-10-06');
  });

  it('rechaza fechas imposibles o con otro formato', () => {
    expect(parseRequestDate('2026-02-30')).toBeNull();
    expect(parseRequestDate('16 de octubre')).toBeNull();
    expect(parseRequestDate('')).toBeNull();
  });
});

describe('parseRequests', () => {
  it('sin la pestaña no hay solicitudes ni errores', () => {
    expect(parseRequests([], TODAY)).toEqual({
      items: [],
      problems: [],
      notes: [],
      rows: 0,
      drafts: 0,
    });
  });

  it('publica solo fecha, grupo y ciudad de las filas marcadas', () => {
    const parsed = parseRequests(
      grid(
        request({}),
        request({ publicar: '', ciudad: 'Cali' }),
        request({ grupo: 'Público', ciudad: 'Bogotá', fecha: '2026-10-17 08:00' }),
      ),
      TODAY,
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.items).toEqual([
      { id: '2026-10-17-fila-4', date: '2026-10-17', group: 'publico', city: 'Bogotá' },
      { id: '2026-10-16-fila-2', date: '2026-10-16', group: 'privado', city: 'Medellín' },
    ]);
    expect(parsed.drafts).toBe(1);
    expect(parsed.notes).toEqual([
      {
        sheet: 'Solicitudes',
        row: 3,
        text: 'No se publica: escribe "Sí" en "Publicar" para mostrarla',
      },
    ]);
    expect(JSON.stringify(parsed.items)).not.toMatch(/Ana|Dulce|@dulce/);
  });

  it('no publica solicitudes antiguas ni futuras', () => {
    const parsed = parseRequests(
      grid(request({ fecha: '2026-09-01' }), request({ fecha: '2026-10-20' })),
      TODAY,
    );
    expect(parsed.items).toEqual([]);
    expect(parsed.problems).toEqual([]);
    expect(parsed.notes.map((note) => note.row)).toEqual([2, 3]);
  });

  it('marca errores sin citar datos personales', () => {
    const parsed = parseRequests(
      grid(
        request({ fecha: 'ayer' }),
        request({ grupo: 'VIP' }),
        request({ ciudad: 'X' }),
        request({ publicar: 'tal vez' }),
      ),
      TODAY,
    );
    expect(parsed.items).toEqual([]);
    expect(parsed.problems.map(formatProblem)).toEqual([
      'Solicitudes, fila 2: "Fecha" debe tener el formato 2026-10-17 o 17/10/2026.',
      'Solicitudes, fila 3: "Grupo" debe ser "Público" o "Privado".',
      'Solicitudes, fila 4: "Ciudad" es demasiado corta (mínimo 2 caracteres).',
      'Solicitudes, fila 5: "Publicar" debe ser "Sí" o "No" (o quedar vacío).',
    ]);
    expect(parsed.problems.map(formatProblem).join(' ')).not.toMatch(/Ana|Dulce/);
  });

  it('exige las columnas que lee', () => {
    const parsed = parseRequests([row(['Fecha', 'Nombre'])], TODAY);
    expect(parsed.problems.map(formatProblem)).toEqual([
      'Pestaña "Solicitudes": faltan las columnas "grupo", "ciudad", "publicar".',
    ]);
  });

  it('publica como máximo 20 solicitudes, las más recientes', () => {
    const rows = Array.from({ length: 25 }, (_, index) =>
      request({ fecha: `2026-10-${String(5 + Math.floor(index / 2)).padStart(2, '0')}` }),
    );
    const parsed = parseRequests(grid(...rows), TODAY);
    expect(parsed.items).toHaveLength(20);
    expect(parsed.items[0]?.date).toBe('2026-10-17');
  });
});

describe('buildRequestEntry', () => {
  const draft = {
    id: '2026-10-16-fila-2',
    date: '2026-10-16',
    group: 'privado',
    city: 'Cali',
  } as const;

  it('conserva la fecha de actualización si no cambió', () => {
    const previous = { ...draft, updatedAt: '2026-10-16' };
    expect(buildRequestEntry(draft, previous, false, TODAY).updatedAt).toBe('2026-10-16');
    expect(buildRequestEntry(draft, undefined, false, TODAY).updatedAt).toBe(TODAY);
  });
});
