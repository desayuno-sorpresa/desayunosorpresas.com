import { imageFiles, stampEntry, type DriveImageRef } from './collection.ts';
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

/** Portada `01.webp` y galería desde `02.webp`. */
export function serviceImages(service: ServiceDraft): DriveImageRef[] {
  return [service.cover, ...service.gallery];
}

export function buildServiceEntry(
  service: ServiceDraft,
  previous: ServiceEntry | undefined,
  imagesChanged: boolean,
  today: string,
): ServiceEntry {
  const [cover = '', ...gallery] = imageFiles(service.slug, 1 + service.gallery.length);
  return stampEntry<ServiceEntry>(
    {
      id: service.slug,
      title: service.title,
      summary: service.summary,
      description: service.description,
      benefits: service.benefits,
      ...(service.priceFrom === undefined ? {} : { priceFrom: service.priceFrom }),
      order: service.order,
      status: 'publicado',
      ...(service.ctaLabel === undefined ? {} : { ctaLabel: service.ctaLabel }),
      cover,
      coverAlt: service.cover.alt,
      gallery: service.gallery.map((image, index) => ({
        src: gallery[index] ?? '',
        alt: image.alt,
      })),
    },
    previous,
    imagesChanged,
    today,
  );
}
