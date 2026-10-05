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
const plainText = (value: string): string => String(value)
  .replace(/₱/g, 'PHP ')
  .replace(/[–—]/g, '-')
  .replace(/[·•]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E]/g, '');

const escapeText = (value: string): string => plainText(value)
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

// Glyph widths of Helvetica and Helvetica-Bold for characters 32 to 126, in
// thousandths of the font size (from the fonts' standard metrics).
const WIDTHS = {
  regular: [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ],
  bold: [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
  ],
};

/** How wide a piece of text prints, in points. */
export function textWidth(value: string, size: number, bold = false): number {
  const widths = bold ? WIDTHS.bold : WIDTHS.regular;
  let total = 0;
  for (const char of plainText(value)) total += widths[char.charCodeAt(0) - 32] ?? 556;
  return (total * size) / 1000;
}

/** The text, cut short with "..." if it is wider than `max` points. */
export function fitText(value: string, size: number, max: number, bold = false): string {
  const text = plainText(value);
  if (textWidth(text, size, bold) <= max) return text;
  let cut = text;
  while (cut && textWidth(`${cut}...`, size, bold) > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

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
