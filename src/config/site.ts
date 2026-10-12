import type { GroupId } from '../lib/join-request.ts';

export interface NavItem {
  label: string;
  /** Ruta interna relativa a la base (se resuelve con `withBase`). */
  path: string;
}

export interface WhatsAppGroup {
  id: GroupId;
  title: string;
  audience: string;
  description: string;
  conditions: readonly string[];
}

export interface SiteConfig {
  /** Nombre descriptivo mientras no exista marca definitiva. */
  name: string;
  /** Marca registrada/comercial; `null` = pendiente (sin JSON-LD de organización). */
  brandName: string | null;
  description: string;
  lang: string;
  ogLocale: string;
  /** Número del administrador (formato internacional). `null` = formulario deshabilitado. */
  adminWhatsApp: string | null;
  /** Correo de contacto visible (también canal para derechos sobre datos personales). */
  contactEmail: string;
  /** Origen del tráfico de clientes del grupo público. */
  referralSiteName: string;
  nav: readonly NavItem[];
  groups: readonly WhatsAppGroup[];
  /** Textos marcados como provisionales; bloquean la publicación (`check:release`). */
  provisional: { conditions: boolean; privacy: boolean };
}

export const siteConfig: SiteConfig = {
  name: 'Servicios para negocios de desayunos sorpresa',
  brandName: 'Desayunos Sorpresa',
  description:
    'Servicios para pequeños y medianos negocios de desayunos sorpresa y grupos de WhatsApp para conectar con clientes y con otros negocios.',
  lang: 'es-CO',
  ogLocale: 'es_CO',
  adminWhatsApp: '+57 312 506 5058',
  contactEmail: 'desayunos.sorpresa.col@gmail.com',
  referralSiteName: 'desayunosorpresacol',
  nav: [
    { label: 'Inicio', path: '' },
    { label: 'Servicios', path: 'servicios/' },
    { label: 'Condiciones', path: 'condiciones/' },
  ],
  groups: [
    {
      id: 'publico',
      title: 'Grupo de clientes y negocios',
      audience: 'Clientes y negocios',
      description:
        'Para clientes que llegan desde desayunosorpresacol y los negocios que les ofrecen sus desayunos sorpresa.',
      conditions: [
        'Tratar con respeto a todas las personas del grupo.',
        'No enviar cadenas, spam ni contenido ajeno a los desayunos sorpresa.',
        'Los negocios publican sus ofertas solo en el formato y horario que indique el administrador.',
      ],
    },
    {
      id: 'privado',
      title: 'Grupo privado de negocios',
      audience: 'Solo negocios',
      description:
        'Exclusivo para negocios de desayunos sorpresa: novedades y servicios nuevos o actuales para hacer crecer tu negocio.',
      conditions: [
        'Tener un negocio activo de desayunos sorpresa.',
        'Compartir el Instagram, la web o el catálogo del negocio para verificarlo.',
        'No compartir el enlace del grupo con terceros.',
      ],
    },
  ],
  provisional: { conditions: false, privacy: false },
};
