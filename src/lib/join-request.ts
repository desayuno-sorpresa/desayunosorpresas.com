export const GROUP_IDS = ['publico', 'privado'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export interface JoinRequest {
  group: GroupId;
  name: string;
  business: string;
  city: string;
  social: string;
}

export type JoinRequestField = keyof JoinRequest | 'acceptsConditions' | 'acceptsPrivacy';
export type JoinRequestErrors = Partial<Record<JoinRequestField, string>>;

export type JoinRequestResult =
  { ok: true; value: JoinRequest } | { ok: false; errors: JoinRequestErrors };

/** Datos tal como llegan del formulario (`FormData` convertido a texto). */
export type JoinRequestInput = Partial<Record<JoinRequestField, string>>;

const MAX_LENGTH = 80;

/** Una sola línea, sin espacios repetidos: evita que el texto altere el formato del mensaje. */
function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function isGroupId(value: string): value is GroupId {
  return (GROUP_IDS as readonly string[]).includes(value);
}

export function parseJoinRequest(input: JoinRequestInput): JoinRequestResult {
  const errors: JoinRequestErrors = {};
  const group = clean(input.group);
  const name = clean(input.name);
  const business = clean(input.business);
  const city = clean(input.city);
  const social = clean(input.social);

  if (!isGroupId(group)) errors.group = 'Elige el grupo al que quieres ingresar.';
  if (name.length < 2) errors.name = 'Escribe tu nombre.';
  if (city.length < 2) errors.city = 'Escribe tu ciudad.';
  if (group === 'privado' && business.length < 2) {
    errors.business = 'El grupo privado es solo para negocios: escribe el nombre de tu negocio.';
  }
  if (group === 'privado' && social.length < 3) {
    errors.social = 'Escribe el Instagram, la web o el catálogo de tu negocio para verificarlo.';
  }
  for (const [field, value] of [
    ['name', name],
    ['business', business],
    ['city', city],
    ['social', social],
  ] as const) {
    if (value.length > MAX_LENGTH) errors[field] = `Máximo ${MAX_LENGTH} caracteres.`;
  }
  if (input.acceptsConditions !== 'on') {
    errors.acceptsConditions = 'Debes aceptar las condiciones del grupo.';
  }
  if (input.acceptsPrivacy !== 'on') {
    errors.acceptsPrivacy =
      'Debes autorizar el tratamiento de tus datos para gestionar la solicitud.';
  }

  if (Object.keys(errors).length > 0 || !isGroupId(group)) return { ok: false, errors };
  return { ok: true, value: { group, name, business, city, social } };
}

/** Mensaje que la persona envía por WhatsApp al administrador. */
export function buildJoinRequestMessage(request: JoinRequest, groupTitle: string): string {
  const lines = [
    `Hola, quiero solicitar ingreso al *${groupTitle}*.`,
    '',
    `• Nombre: ${request.name}`,
    ...(request.business ? [`• Negocio: ${request.business}`] : []),
    `• Ciudad: ${request.city}`,
    ...(request.social ? [`• Instagram, web o catálogo: ${request.social}`] : []),
    '',
    'Acepto las condiciones del grupo y autorizo el tratamiento de mis datos para gestionar esta solicitud.',
  ];
  return lines.join('\n');
}
