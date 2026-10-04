import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cloudEnabled, env } from "@/config/env";

let client: SupabaseClient | null = null;

/** Null when the app runs without cloud configuration (local demo mode). */
export function getSupabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  client ??= createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
