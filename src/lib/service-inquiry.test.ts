import { describe, expect, it } from 'vitest';
import { buildServiceInquiryMessage, formatCop } from './service-inquiry';

describe('buildServiceInquiryMessage', () => {
  it('menciona el servicio en una sola línea', () => {
    expect(buildServiceInquiryMessage(' Fotos \n de catálogo ')).toBe(
      'Hola, me interesa el servicio "Fotos de catálogo". ¿Me pueden dar más información?',
    );
  });
});

describe('formatCop', () => {
  it('formatea sin decimales con separador de miles', () => {
    expect(formatCop(150000).replace(/\s/g, ' ')).toBe('$ 150.000');
  });
});
