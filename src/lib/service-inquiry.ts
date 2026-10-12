/** Mensaje de WhatsApp para consultar por un servicio concreto. */
export function buildServiceInquiryMessage(serviceTitle: string): string {
  return `Hola, me interesa el servicio "${serviceTitle.replace(/\s+/g, ' ').trim()}". ¿Me pueden dar más información?`;
}

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Precio en pesos colombianos, p. ej. "$ 150.000". */
export function formatCop(amount: number): string {
  return copFormatter.format(amount);
}
