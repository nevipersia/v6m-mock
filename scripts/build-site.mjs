// Copies the static site into dist/ for hosting (Vercel serves that folder).
// Run after tsc so assets/js/ holds the compiled TypeScript.
//
// With SUPABASE_URL and SUPABASE_ANON_KEY set (Vercel project settings, or a
// shell), the build points the app at Supabase and leaves the mock data out.
// Without them it is the local demo, exactly as the repo runs it.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'dist';
const ENTRIES = ['index.html', 'admin', 'book', 'data', 'assets'];

if (!existsSync('assets/js/admin/main.js')) {
  console.error('assets/js is missing. Run tsc first.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL?.trim() ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? '';
if (Boolean(url) !== Boolean(anonKey)) {
  console.error('Set both SUPABASE_URL and SUPABASE_ANON_KEY, or neither for the demo.');
  process.exit(1);
}
if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
  console.error(`SUPABASE_URL does not look like a Supabase project URL: ${url}`);
  process.exit(1);
}
const supabase = Boolean(url);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const entry of ENTRIES) {
  cpSync(entry, `${OUT}/${entry}`, {
    recursive: true,
    // Production never reads the sample guests and bookings.
    filter: (source) => !source.endsWith('.map') && !(supabase && source.replaceAll('\\', '/').endsWith('data/mock-data.json')),
  });
}

if (supabase) {
  const settings = { backend: 'supabase', supabaseUrl: url.replace(/\/$/, ''), supabaseAnonKey: anonKey };
  writeFileSync(`${OUT}/assets/config.js`, `// Written by scripts/build-site.mjs.\nglobalThis.V6M_CONFIG = ${JSON.stringify(settings, null, 2)};\n`);
}

console.log(`Site copied to ${OUT}/: ${ENTRIES.join(', ')} · backend: ${supabase ? `Supabase (${url})` : 'mock demo'}`);
