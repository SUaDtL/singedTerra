import { describe, expect, it } from 'vitest'
import { hasSupabaseConfig } from './supabaseConfig'

describe('hasSupabaseConfig', () => {
  it('requires both non-empty public Supabase values without returning either value', () => {
    expect(hasSupabaseConfig({})).toBe(false)
    expect(hasSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false)
    expect(hasSupabaseConfig({ VITE_SUPABASE_ANON_KEY: 'public-key' })).toBe(false)
    expect(hasSupabaseConfig({
      VITE_SUPABASE_URL: ' https://example.supabase.co ',
      VITE_SUPABASE_ANON_KEY: ' public-key ',
    })).toBe(true)
  })
})
