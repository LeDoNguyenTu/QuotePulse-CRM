import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev so a missing .env is obvious.
  // eslint-disable-next-line no-console
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.'
  );
}

// The client is intentionally untyped (no Database generic): we cast query
// results to the interfaces in ./types ourselves. This keeps insert/upsert
// payloads simple and avoids brittle generated-type coupling.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // sessionStorage, not the default localStorage: closing the tab or browser
    // ends the session, while refreshing the same tab keeps you signed in.
    // With localStorage + autoRefreshToken the refresh token lived forever and
    // silently minted new access tokens, so a login never expired at all.
    //
    // Trade-off: a NEW tab starts without a session and requires signing in
    // again. That is inherent to this model. Switch back to
    // window.localStorage here if that becomes annoying — the 2h idle timeout
    // in useIdleTimeout.ts still applies either way.
    storage: window.sessionStorage,
  },
});
