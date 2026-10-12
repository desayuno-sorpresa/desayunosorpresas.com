import { describe, expect, it } from 'vitest';
import { findReleaseBlockers } from './release-check';

const ready = {
  brandName: 'Marca',
  adminWhatsApp: '+57 300 123 4567',
  provisional: { conditions: false, privacy: false },
};

describe('findReleaseBlockers', () => {
  it('no bloquea una configuración completa', () => {
    expect(findReleaseBlockers(ready)).toEqual([]);
  });

  it('bloquea por datos pendientes o provisionales', () => {
    const blockers = findReleaseBlockers({
      brandName: null,
      adminWhatsApp: null,
      provisional: { conditions: true, privacy: true },
    });
    expect(blockers).toHaveLength(4);
  });

  it('bloquea por un número inválido', () => {
    expect(findReleaseBlockers({ ...ready, adminWhatsApp: '123' })).toEqual([
      'El número de WhatsApp "123" no es válido.',
    ]);
  });
});
