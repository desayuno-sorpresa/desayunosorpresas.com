// Cliente mínimo de Google Sheets y Drive (solo lectura) sobre fetch nativo.
import type { SheetCell, SheetGrid } from '../../src/lib/content-sync/sheet.ts';

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

export interface DriveFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Lo que el sync necesita de Google; se inyecta para poder probarlo sin red. */
export interface ContentSource {
  readSheets(names: readonly string[]): Promise<Map<string, SheetGrid>>;
  downloadImage(fileId: string): Promise<DriveFile>;
}

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

interface CellData {
  formattedValue?: string;
  hyperlink?: string;
  chipRuns?: { chip?: { richLinkProperties?: { uri?: string } } }[];
}

interface SpreadsheetResponse {
  sheets?: {
    properties?: { title?: string };
    data?: { rowData?: { values?: CellData[] }[] }[];
  }[];
}

function toCell(data: CellData): SheetCell {
  const chipLink = data.chipRuns?.find((run) => run.chip?.richLinkProperties?.uri)?.chip
    ?.richLinkProperties?.uri;
  const link = chipLink ?? data.hyperlink;
  return { text: data.formattedValue ?? '', ...(link ? { link } : {}) };
}

export function createGoogleSource(spreadsheetId: string, accessToken: string): ContentSource {
  const headers = { Authorization: `Bearer ${accessToken}` };

  async function request(url: string): Promise<Response> {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google respondió ${response.status} para ${url.split('?')[0]}: ${detail}`);
    }
    return response;
  }

  return {
    async readSheets(names) {
      const params = new URLSearchParams({
        fields:
          'sheets(properties.title,data.rowData.values(formattedValue,hyperlink,chipRuns.chip.richLinkProperties.uri))',
      });
      for (const name of names) params.append('ranges', `'${name}'`);
      const response = await request(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?${params}`,
      );
      const body = (await response.json()) as SpreadsheetResponse;
      const result = new Map<string, SheetGrid>();
      for (const sheet of body.sheets ?? []) {
        const title = sheet.properties?.title ?? '';
        const rows = (sheet.data?.[0]?.rowData ?? []).map((row) => (row.values ?? []).map(toCell));
        result.set(title, rows);
      }
      return result;
    },

    async downloadImage(fileId) {
      const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
      const metaResponse = await request(
        `${base}?fields=name,mimeType,size&supportsAllDrives=true`,
      );
      const meta = (await metaResponse.json()) as {
        name?: string;
        mimeType?: string;
        size?: string;
      };
      if (Number(meta.size ?? 0) > MAX_IMAGE_BYTES) {
        throw new Error(`La foto "${meta.name}" pesa más de 25 MB.`);
      }
      const media = await request(`${base}?alt=media&supportsAllDrives=true`);
      return {
        name: meta.name ?? fileId,
        mimeType: meta.mimeType ?? '',
        bytes: new Uint8Array(await media.arrayBuffer()),
      };
    },
  };
}
