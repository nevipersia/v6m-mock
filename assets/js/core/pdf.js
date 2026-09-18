// Tiny PDF writer: one A4 page of text, lines and filled rectangles, with no
// dependencies. Coordinates are PDF points with the origin at the bottom left.

const PAGE = { width: 595, height: 842 };

/** WinAnsi-safe text: PDF's built-in Helvetica has no peso sign or en dash. */
const escapeText = (value) => String(value)
  .replace(/₱/g, 'PHP ')
  .replace(/[–—]/g, '-')
  .replace(/[·•]/g, '-')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E]/g, '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const round = (n) => Math.round(n * 100) / 100;

function toStream(items) {
  const out = [];
  for (const item of items) {
    if (item.type === 'text') {
      const font = item.bold ? '/F2' : '/F1';
      const gray = item.gray ?? 0;
      out.push(`BT ${gray} g ${font} ${item.size ?? 11} Tf 1 0 0 1 ${round(item.x)} ${round(item.y)} Tm (${escapeText(item.value)}) Tj ET`);
    } else if (item.type === 'line') {
      out.push(`${item.gray ?? 0.75} G ${item.width ?? 1} w ${round(item.x1)} ${round(item.y1)} m ${round(item.x2)} ${round(item.y2)} l S`);
    } else if (item.type === 'rect') {
      const [r, g, b] = item.color ?? [0, 0, 0];
      out.push(`${r} ${g} ${b} rg ${round(item.x)} ${round(item.y)} ${round(item.width)} ${round(item.height)} re f`);
    }
  }
  return out.join('\n');
}

/** @param {Array} items drawing operations @returns {Blob} */
export function createPdf(items) {
  const stream = toStream(items);
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${PAGE.width} ${PAGE.height}]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>`,
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startXref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${startXref}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}

export function downloadBlob(blob, filename) {
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
