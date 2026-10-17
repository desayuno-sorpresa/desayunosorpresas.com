/**
 * Guarda en la pestaña "Solicitudes" cada solicitud de ingreso enviada desde el formulario
 * del sitio. Proyecto independiente de Apps Script (script.google.com → Nuevo proyecto) que
 * abre la hoja de contenido por su ID; no forma parte del build del sitio.
 *
 * Despliegue:
 *   0. Ejecutar la función "preparar" una vez (pide permisos y crea la pestaña).
 *   1. Implementar → Nueva implementación → Aplicación web.
 *      Ejecutar como: "Yo". Quién tiene acceso: "Cualquier usuario".
 *   2. Copiar la URL (https://script.google.com/macros/s/…/exec) en
 *      `siteConfig.joinRequests.endpoint` (src/config/site.ts).
 *   3. Revisar el texto de privacidad (/privacidad/) y, si se aprueba,
 *      poner `siteConfig.joinRequests.privacyApproved: true`.
 *
 * Para publicar una solicitud en el aviso del sitio, escribir "Sí" en "Publicar".
 * El sync diario solo lee Fecha, Grupo, Ciudad y Publicar: nombre, negocio y redes
 * nunca salen de la hoja.
 */

// Hoja de contenido (el ID está en su URL: docs.google.com/spreadsheets/d/<ID>/edit).
const SPREADSHEET_ID = '1fhydjA3oUvsC8hRt0gOLEO5O9z_2mkQXUnNaABVQkjE';
const SHEET_NAME = 'Solicitudes';
const HEADERS = [
  'Fecha',
  'Grupo',
  'Nombre',
  'Negocio',
  'Ciudad',
  'Instagram, web o catálogo',
  'Publicar',
  'Errores a corregir',
  'Detalle error',
];
const GROUPS = { publico: 'Público', privado: 'Privado' };
const MAX_LENGTH = 80;
// Freno simple contra envíos masivos: máximo de solicitudes por cada 10 minutos.
const MAX_PER_WINDOW = 30;
const WINDOW_SECONDS = 600;

/**
 * Ejecutar una sola vez a mano (selector de funciones → "preparar" → Ejecutar):
 * pide los permisos y crea la pestaña "Solicitudes" si aún no existe.
 */
function preparar() {
  getSheet_();
}

function doPost(e) {
  const params = (e && e.parameter) || {};
  const group = GROUPS[params.group];
  const name = clean_(params.name);
  const city = clean_(params.city);
  if (!group || name.length < 2 || city.length < 2) return reply_('invalid');
  if (!withinRateLimit_()) return reply_('busy');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const values = {
      Fecha: Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm'),
      Grupo: group,
      Nombre: name,
      Negocio: clean_(params.business),
      Ciudad: city,
      'Instagram, web o catálogo': clean_(params.social),
      Publicar: 'No',
    };
    // Por nombre de columna: se pueden reordenar o añadir columnas en la hoja.
    const row = headers.map((header) => (header in values ? values[header] : ''));
    sheet
      .getRange(sheet.getLastRow() + 1, 1, 1, row.length)
      .setNumberFormat('@')
      .setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return reply_('ok');
}

/** Una línea, longitud máxima y sin fórmulas: quita "=", "+" o "-" al inicio. */
function clean_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[=+\-]+\s*/, '')
    .slice(0, MAX_LENGTH);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    const publish = SpreadsheetApp.newDataValidation().requireValueInList(['Sí', 'No']).build();
    sheet
      .getRange(2, HEADERS.indexOf('Publicar') + 1, sheet.getMaxRows() - 1)
      .setDataValidation(publish);
  }
  return sheet;
}

function withinRateLimit_() {
  const cache = CacheService.getScriptCache();
  const count = Number(cache.get('solicitudes') || 0);
  if (count >= MAX_PER_WINDOW) return false;
  cache.put('solicitudes', String(count + 1), WINDOW_SECONDS);
  return true;
}

function reply_(status) {
  return ContentService.createTextOutput(status).setMimeType(ContentService.MimeType.TEXT);
}
