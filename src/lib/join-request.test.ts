import { describe, expect, it } from 'vitest';
import { buildJoinRequestMessage, parseJoinRequest } from './join-request';

const base = {
  group: 'publico',
  name: 'Ana',
  city: 'Bogotá',
  acceptsConditions: 'on',
  acceptsPrivacy: 'on',
};

describe('parseJoinRequest', () => {
  it('acepta una solicitud mínima al grupo público', () => {
    const result = parseJoinRequest(base);
    expect(result).toEqual({
      ok: true,
      value: { group: 'publico', name: 'Ana', business: '', city: 'Bogotá', social: '' },
    });
  });

  it('exige negocio y red social para el grupo privado', () => {
    const result = parseJoinRequest({ ...base, group: 'privado' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['business', 'social']);
  });

  it('exige aceptar condiciones y tratamiento de datos', () => {
    const { acceptsConditions: _omitted, ...withoutConditions } = base;
    const result = parseJoinRequest({ ...withoutConditions, acceptsPrivacy: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.acceptsConditions).toBeDefined();
      expect(result.errors.acceptsPrivacy).toBeDefined();
    }
  });

  it('rechaza un grupo desconocido', () => {
    const result = parseJoinRequest({ ...base, group: 'otro' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.group).toBeDefined();
  });

  it('normaliza espacios y saltos de línea', () => {
    const result = parseJoinRequest({ ...base, name: '  Ana \n  María  ' });
    expect(result.ok && result.value.name).toBe('Ana María');
  });

  it('limita la longitud de los campos', () => {
    const result = parseJoinRequest({ ...base, name: 'a'.repeat(81) });
    expect(result.ok).toBe(false);
  });
});

describe('buildJoinRequestMessage', () => {
  it('incluye solo los campos con valor', () => {
    const message = buildJoinRequestMessage(
      { group: 'publico', name: 'Ana', business: '', city: 'Bogotá', social: '' },
      'Grupo de clientes y negocios',
    );
    expect(message).toContain('*Grupo de clientes y negocios*');
    expect(message).toContain('• Nombre: Ana');
    expect(message).not.toContain('Negocio');
    expect(message).not.toContain('Instagram');
  });

  it('incluye negocio y red social cuando existen', () => {
    const message = buildJoinRequestMessage(
      { group: 'privado', name: 'Ana', business: 'Dulce Mañana', city: 'Cali', social: '@dulce' },
      'Grupo privado de negocios',
    );
    expect(message).toContain('• Negocio: Dulce Mañana');
    expect(message).toContain('• Instagram, web o catálogo: @dulce');
  });
});
