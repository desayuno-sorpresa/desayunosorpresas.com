import { normalizePhone } from './whatsapp.ts';

export interface ReleaseInput {
  brandName: string | null;
  adminWhatsApp: string | null;
  provisional: { conditions: boolean; privacy: boolean };
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
  return blockers;
}
