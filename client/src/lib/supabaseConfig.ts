export interface SupabasePublicEnv {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export function hasSupabaseConfig(
  env?: SupabasePublicEnv,
): boolean {
  const source = env ?? {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }
  return Boolean(
    source.VITE_SUPABASE_URL?.trim()
    && source.VITE_SUPABASE_ANON_KEY?.trim(),
  )
}
