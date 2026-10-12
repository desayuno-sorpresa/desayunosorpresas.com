/** Límites compartidos entre el sync (mensajes amigables) y el esquema Zod de la colección. */
export const SERVICE_LIMITS = {
  title: { min: 3, max: 90 },
  summary: { min: 10, max: 160 },
  ctaLabel: { min: 2, max: 40 },
  altMin: 5,
} as const;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
