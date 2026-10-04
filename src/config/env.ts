// Only public, client-safe values belong here. Anything secret (service-role key,
// payment keys) must live in Supabase Edge Functions, never in VITE_ variables.
export const env = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || null,
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || null,
  mapStyleUrl: (import.meta.env.VITE_MAP_STYLE_URL as string | undefined)?.trim() || "https://tiles.openfreemap.org/styles/dark",
};

export const cloudEnabled = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const APP_NAME = "Splitline";
