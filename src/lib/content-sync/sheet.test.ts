import { describe, expect, it } from 'vitest';
import { readTable } from './sheet';

const cell = (text: string) => ({ text });

describe('readTable', () => {
  it('lee por nombre de columna normalizado e ignora filas vacías', () => {
    const { records, problems } = readTable(
      'Servicios',
      [
        [cell('Título'), cell('Estado')],
        [cell('Fotos'), cell('Publicado')],
        [cell(''), cell(' ')],
        [cell('Logo')],
      ],
      ['titulo'],
    );
    expect(problems).toEqual([]);
    expect(records.map((r) => [r.row, r.get('titulo').text, r.get('estado').text])).toEqual([
      [2, 'Fotos', 'Publicado'],
      [4, 'Logo', ''],
    ]);
  });

  it('informa las columnas que faltan', () => {
    const { problems } = readTable('Fotos', [[cell('Servicio')]], ['servicio', 'foto']);
    expect(problems).toEqual([
      { sheet: 'Fotos', message: 'Pestaña "Fotos": faltan las columnas "foto".' },
    ]);
  });
});
