import { normalizePhone } from './whatsapp.ts';

export interface ReleaseInput {
  brandName: string | null;
  adminWhatsApp: string | null;
  provisional: { conditions: boolean; privacy: boolean };
  joinRequests: { endpoint: string | null; privacyApproved: boolean };
}

function isAppsScriptUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'script.google.com';
  } catch {
    return false;
  }
}

/** Lista los datos que faltan para publicar en producción. Vacía = listo. */
export function findReleaseBlockers(config: ReleaseInput): string[] {
  const blockers: string[] = [];
  if (config.adminWhatsApp === null) {
    blockers.push('Falta el número de WhatsApp del administrador (siteConfig.adminWhatsApp).');
  } else if (normalizePhone(config.adminWhatsApp) === null) {
    blockers.push(`El número de WhatsApp "${config.adminWhatsApp}" no es válido.`);
  }
  if (config.brandName === null)
    blockers.push('Falta el nombre de la marca (siteConfig.brandName).');
  if (config.provisional.conditions)
    blockers.push('Las condiciones de los grupos son provisionales.');
  if (config.provisional.privacy)
    blockers.push('La política de tratamiento de datos es provisional.');
  if (config.joinRequests.endpoint !== null && !config.joinRequests.privacyApproved) {
    blockers.push(
      'El formulario guarda solicitudes en Google Sheets, pero el texto de privacidad que lo explica no está aprobado (siteConfig.joinRequests.privacyApproved).',
    );
  }
  if (config.joinRequests.endpoint !== null && !isAppsScriptUrl(config.joinRequests.endpoint)) {
    blockers.push('siteConfig.joinRequests.endpoint debe ser una URL https://script.google.com/….');
  }
  return blockers;
}
