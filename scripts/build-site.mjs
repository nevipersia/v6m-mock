// Copies the static site into dist/ for hosting (Vercel serves that folder).
// Run after tsc so assets/js/ holds the compiled TypeScript.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'dist';
const ENTRIES = ['index.html', 'admin', 'book', 'data', 'assets'];

if (!existsSync('assets/js/admin/main.js')) {
  console.error('assets/js is missing. Run tsc first.');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of ENTRIES) {
  cpSync(entry, `${OUT}/${entry}`, {
    recursive: true,
    filter: (source) => !source.endsWith('.map'),
  });
}
console.log(`Site copied to ${OUT}/: ${ENTRIES.join(', ')}`);
