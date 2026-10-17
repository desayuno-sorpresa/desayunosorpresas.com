import { describe, expect, it } from 'vitest';
import {
  dateInTimeZone,
  daysBetween,
  newestFirst,
  parseIsoDate,
  relativeDay,
  requestNotice,
} from './recent-requests';

describe('parseIsoDate y daysBetween', () => {
  it('valida fechas reales', () => {
    expect(parseIsoDate('2026-10-17')).not.toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('17/10/2026')).toBeNull();
  });

  it('cuenta días entre fechas, también entre meses', () => {
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
    expect(daysBetween('2026-10-17', '2026-10-17')).toBe(0);
    expect(daysBetween('x', '2026-10-17')).toBeNull();
  });
});

describe('dateInTimeZone', () => {
  it('usa el día de Colombia, no el de UTC', () => {
    // 03:00 UTC del 18 = 22:00 del 17 en Bogotá.
    expect(dateInTimeZone(new Date('2026-10-18T03:00:00Z'))).toBe('2026-10-17');
  });
});

describe('relativeDay', () => {
  it('describe el día de forma relativa', () => {
    expect(relativeDay('2026-10-17', '2026-10-17', 14)).toBe('hoy');
    expect(relativeDay('2026-10-16', '2026-10-17', 14)).toBe('ayer');
    expect(relativeDay('2026-10-14', '2026-10-17', 14)).toBe('hace 3 días');
  });

  it('descarta fechas futuras o fuera del límite', () => {
    expect(relativeDay('2026-10-18', '2026-10-17', 14)).toBeNull();
    expect(relativeDay('2026-10-02', '2026-10-17', 14)).toBeNull();
    expect(relativeDay('2026-10-03', '2026-10-17', 14)).toBe('hace 14 días');
  });
});

describe('newestFirst', () => {
  it('ordena de la más reciente a la más antigua', () => {
    const requests = [
      { date: '2026-10-10', group: 'publico', city: 'Cali' },
      { date: '2026-09-01', group: 'privado', city: 'Pasto' },
      { date: '2026-10-16', group: 'privado', city: 'Bogotá' },
    ] as const;
    expect(newestFirst(requests).map((r) => r.city)).toEqual(['Bogotá', 'Cali', 'Pasto']);
  });
});

describe('requestNotice', () => {
  it('es anónimo y nombra el grupo', () => {
    expect(
      requestNotice(
        { date: '2026-10-17', group: 'privado', city: 'Cali' },
        'Grupo privado de negocios',
      ),
    ).toBe('Un negocio de Cali solicitó unirse al grupo privado de negocios');
    expect(
      requestNotice(
        { date: '2026-10-17', group: 'publico', city: 'Bogotá' },
        'Grupo de clientes y negocios',
      ),
    ).toBe('Alguien de Bogotá solicitó unirse al grupo de clientes y negocios');
  });
});
