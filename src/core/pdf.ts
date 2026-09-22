// Tiny PDF writer: A4 pages of text, lines and filled rectangles, with no
// dependencies. Coordinates are PDF points with the origin at the bottom left.

export type RGB = [number, number, number];

export type PdfItem =
  | { type: 'text'; x: number; y: number; value: string; size?: number; bold?: boolean; gray?: number; color?: RGB }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; gray?: number; width?: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number; color?: RGB };

const PAGE = { width: 595, height: 842 } as const;
const NL = '\n';

/** WinAnsi-safe text: PDF's built-in Helvetica has no peso sign or en dash. */
const escapeText = (value: string): string => String(value)
  .replace(/₱/g, 'PHP ')
  .replace(/[–—]/g, '-')
  .replace(/[·•]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const round = (n: number): number => Math.round(n * 100) / 100;

function toStream(items: PdfItem[]): string {
  return items.map((item) => {
    switch (item.type) {
      case 'text': {
        const font = item.bold ? '/F2' : '/F1';
        const fill = item.color ? `${item.color.join(' ')} rg` : `${item.gray ?? 0} g`;
        return `BT ${fill} ${font} ${item.size ?? 11} Tf 1 0 0 1 ${round(item.x)} ${round(item.y)} Tm (${escapeText(item.value)}) Tj ET`;
      }
      case 'line':
        return `${item.gray ?? 0.75} G ${item.width ?? 1} w ${round(item.x1)} ${round(item.y1)} m ${round(item.x2)} ${round(item.y2)} l S`;
      case 'rect': {
        const [r, g, b] = item.color ?? [0, 0, 0];
        return `${r} ${g} ${b} rg ${round(item.x)} ${round(item.y)} ${round(item.width)} ${round(item.height)} re f`;
      }
    }
  }).join(NL);
}

/** One A4 page per list of drawing operations. */
export function createPdf(pages: PdfItem[][]): Blob {
  const pageCount = Math.max(1, pages.length);
  // Objects: 1 catalog, 2 page tree, 3 regular font, 4 bold font, then a page and its content stream per page.
  const pageObject = (index: number) => 5 + index * 2;
  const objects: string[] = [
    '<</Type/Catalog/Pages 2 0 R>>',
    `<</Type/Pages/Kids[${Array.from({ length: pageCount }, (_, i) => `${pageObject(i)} 0 R`).join(' ')}]/Count ${pageCount}>>`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>',
  ];
  for (let i = 0; i < pageCount; i += 1) {
    const stream = toStream(pages[i] ?? []);
    objects.push(
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE.width} ${PAGE.height}]/Resources<</Font<</F1 3 0 R/F2 4 0 R>>>>/Contents ${pageObject(i) + 1} 0 R>>`,
      `<</Length ${stream.length}>>${NL}stream${NL}${stream}${NL}endstream`,
    );
  }

  let pdf = `%PDF-1.4${NL}`;
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj${NL}${body}${NL}endobj${NL}`;
  });

  const startXref = pdf.length;
  pdf += `xref${NL}0 ${objects.length + 1}${NL}0000000000 65535 f ${NL}`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n ${NL}`;
  });
  pdf += `trailer${NL}<</Size ${objects.length + 1}/Root 1 0 R>>${NL}startxref${NL}${startXref}${NL}%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const pdfPage = PAGE;
