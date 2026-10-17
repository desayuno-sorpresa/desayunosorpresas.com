import { describe, expect, it } from 'vitest';
import { findReleaseBlockers } from './release-check';

const ready = {
  brandName: 'Marca',
  adminWhatsApp: '+57 300 123 4567',
  provisional: { conditions: false, privacy: false },
  joinRequests: { endpoint: null, privacyApproved: false },
};

const endpoint = 'https://script.google.com/macros/s/abc/exec';

describe('findReleaseBlockers', () => {
  it('no bloquea una configuración completa', () => {
    expect(findReleaseBlockers(ready)).toEqual([]);
  });

  it('bloquea por datos pendientes o provisionales', () => {
    const blockers = findReleaseBlockers({
      brandName: null,
      adminWhatsApp: null,
      provisional: { conditions: true, privacy: true },
      joinRequests: { endpoint: null, privacyApproved: false },
    });
    expect(blockers).toHaveLength(4);
  });

  it('bloquea el guardado de solicitudes sin el texto de privacidad aprobado', () => {
    expect(
      findReleaseBlockers({ ...ready, joinRequests: { endpoint, privacyApproved: false } }),
    ).toHaveLength(1);
    expect(
      findReleaseBlockers({ ...ready, joinRequests: { endpoint, privacyApproved: true } }),
    ).toEqual([]);
  });

  it('bloquea un endpoint que no es de Apps Script', () => {
    expect(
      findReleaseBlockers({
        ...ready,
        joinRequests: { endpoint: 'https://example.com/exec', privacyApproved: true },
      }),
    ).toEqual(['siteConfig.joinRequests.endpoint debe ser una URL https://script.google.com/….']);
  });

  it('bloquea por un número inválido', () => {
    expect(findReleaseBlockers({ ...ready, adminWhatsApp: '123' })).toEqual([
      'El número de WhatsApp "123" no es válido.',
    ]);
  });
});
