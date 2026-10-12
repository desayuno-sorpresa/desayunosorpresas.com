import type { ServiceDraft } from './services.ts';

/** Entrada de `servicios.json` (forma que valida el esquema de la colección). */
export interface ServiceEntry {
  id: string;
  title: string;
  summary: string;
  description: string[];
  benefits: string[];
  priceFrom?: number;
  order: number;
  status: 'publicado';
  ctaLabel?: string;
  cover: string;
  coverAlt: string;
  gallery: { src: string; alt: string }[];
  updatedAt: string;
}

/** Ruta relativa al JSON de cada imagen: portada `01.webp`, galería desde `02.webp`. */
export function imagePaths(service: ServiceDraft): { cover: string; gallery: string[] } {
  const file = (index: number) => `./${service.slug}/${String(index).padStart(2, '0')}.webp`;
  return { cover: file(1), gallery: service.gallery.map((_, index) => file(index + 2)) };
}

/**
 * Construye la entrada final. Conserva la fecha anterior si ni los datos ni las imágenes
 * cambiaron, para que "Actualizado el" refleje cambios reales y el PR no tenga ruido.
 */
export function buildEntry(
  service: ServiceDraft,
  previous: ServiceEntry | undefined,
  imagesChanged: boolean,
  today: string,
): ServiceEntry {
  const paths = imagePaths(service);
  const entry: Omit<ServiceEntry, 'updatedAt'> = {
    id: service.slug,
    title: service.title,
    summary: service.summary,
    description: service.description,
    benefits: service.benefits,
    ...(service.priceFrom === undefined ? {} : { priceFrom: service.priceFrom }),
    order: service.order,
    status: 'publicado',
    ...(service.ctaLabel === undefined ? {} : { ctaLabel: service.ctaLabel }),
    cover: paths.cover,
    coverAlt: service.cover.alt,
    gallery: service.gallery.map((image, index) => ({
      src: paths.gallery[index] ?? '',
      alt: image.alt,
    })),
  };
  const unchanged =
    previous !== undefined && !imagesChanged && sameContent(entry, withoutDate(previous));
  return { ...entry, updatedAt: unchanged ? previous.updatedAt : today };
}

function withoutDate(entry: ServiceEntry): Omit<ServiceEntry, 'updatedAt'> {
  const { updatedAt: _updatedAt, ...rest } = entry;
  return rest;
}

function sameContent(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
