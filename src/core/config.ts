// Which backend this build talks to.
//
// assets/config.js sets globalThis.V6M_CONFIG before the app loads. The copy in
// the repo says 'mock'; `npm run build` rewrites dist/assets/config.js for
// Supabase when SUPABASE_URL and SUPABASE_ANON_KEY are set (see DEPLOY.md).

export type BackendKind = 'mock' | 'supabase';

export interface AppConfig {
  backend: BackendKind;
  supabaseUrl: string;
  /** The public anon key. Safe in the browser: row-level security decides what it can reach. */
  supabaseAnonKey: string;
}

declare global {
  // eslint-disable-next-line no-var
  var V6M_CONFIG: Partial<AppConfig> | undefined;
}

function readConfig(): AppConfig {
  const raw = globalThis.V6M_CONFIG ?? {};
  if (raw.backend === 'supabase' && raw.supabaseUrl && raw.supabaseAnonKey) {
    return { backend: 'supabase', supabaseUrl: raw.supabaseUrl, supabaseAnonKey: raw.supabaseAnonKey };
  }
  return { backend: 'mock', supabaseUrl: '', supabaseAnonKey: '' };
}

export const config: AppConfig = readConfig();

/** True for the local demo: sample data, demo accounts, a frozen demo date. */
export const isMock = config.backend === 'mock';
