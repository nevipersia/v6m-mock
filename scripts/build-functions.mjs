// Copies the compiled app core (assets/js/core) into the Edge Functions, so
// supabase/functions/* run the same booking rules as the desk. Run
// `npm run build:functions` before `supabase functions deploy`.

import { cpSync, existsSync, rmSync } from 'node:fs';

const FROM = 'assets/js/core';
const TO = 'supabase/functions/_shared/core';

if (!existsSync(`${FROM}/actions.js`)) {
  console.error(`${FROM} is missing. Run tsc first.`);
  process.exit(1);
}

rmSync(TO, { recursive: true, force: true });
cpSync(FROM, TO, { recursive: true, filter: (source) => !source.endsWith('.map') });
console.log(`Copied ${FROM} to ${TO}`);
