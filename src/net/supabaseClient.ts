// Supabase client for AstroHold's online 2-player mode.
//
// Points at the shared "TewBit Games" hub but is SCOPED to the
// `astro_hold` schema via `db.schema`, so this client can only ever read
// AstroHold's own tables (profiles / matches / rounds). It can never see
// or touch the sibling games living in `public`.
//
// NOTE: this module is the backend foundation only. It is intentionally
// NOT imported by gameplay yet - the online-PvP netcode (matchmaking,
// realtime board sync, deterministic REVEAL) is a separate build that
// needs design sign-off (it touches game mechanics). Importing this file
// has no side effects; the client is created lazily on first getSupabase().

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Build the schema-scoped client. Inferring the type (via ReturnType below)
// keeps the `astro_hold` schema generic intact instead of widening to the
// default "public"-schema SupabaseClient type.
function makeClient() {
  if (!url || !anonKey) {
    throw new Error(
      'Supabase env vars missing. Set VITE_SUPABASE_URL and ' +
        'VITE_SUPABASE_ANON_KEY in .env.local (local) and in the Vercel ' +
        'project settings (production).',
    )
  }
  return createClient(url, anonKey, {
    db: { schema: 'astro_hold' },
    auth: { persistSession: true, autoRefreshToken: true },
  })
}

let client: ReturnType<typeof makeClient> | null = null

/**
 * Returns the shared Supabase client, scoped to the `astro_hold` schema.
 * Lazily instantiated so importing this module stays side-effect-free.
 * Throws a clear error if the env vars are missing (no .env.local locally,
 * or the VITE_SUPABASE_* vars not set on the Vercel project).
 */
export function getSupabase() {
  if (!client) client = makeClient()
  return client
}

/** True when the Supabase env vars are present (i.e. online mode is wired). */
export function isOnlineConfigured(): boolean {
  return Boolean(url && anonKey)
}
