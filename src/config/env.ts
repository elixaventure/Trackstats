/**
 * Tolerates values pasted straight from Supabase's "Connect" panel, which shows
 * whole lines like NEXT_PUBLIC_SUPABASE_URL=https://… (optionally quoted).
 */
export function cleanEnvValue(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/^[A-Z][A-Z0-9_]*\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  return s || null;
}

// Only public, client-safe values belong here. Anything secret (service-role key,
// payment keys) must live in Supabase Edge Functions, never in VITE_ variables.
export const env = {
  supabaseUrl: cleanEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "") ?? null,
  supabaseAnonKey: cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined),
  mapStyleUrl: (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() || "https://tiles.openfreemap.org/styles/dark",
};

export const cloudEnabled = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const APP_NAME = "TrackStats";
