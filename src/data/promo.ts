import { getSupabase } from "@/sync/supabase";

const KEY = "trackstats.pendingPromo";

/** A code from a QR card, kept while the rider signs up, then claimed. Per device only. */
export function getPendingCode(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setPendingCode(code: string) {
  try { localStorage.setItem(KEY, normaliseCode(code)); } catch { /* private mode: they can type it again */ }
}
export function clearPendingCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export const normaliseCode = (c: string) => c.toUpperCase().replace(/\s+/g, "");

export interface Redeemed { proUntil: number; campaign: string; proMonths: number }

/** Claim a code on the server. Throws with a message fit to show the rider. */
export async function redeemCode(code: string): Promise<Redeemed> {
  const sb = getSupabase();
  if (!sb) throw new Error("Codes need a TrackStats account, which isn't available in this version.");
  if (!navigator.onLine) throw new Error("You're offline. Claim the code when you have signal.");
  const { data, error } = await sb.rpc("redeem_promo", { p_code: normaliseCode(code) });
  if (error) throw new Error(error.message || "Couldn't claim the code. Try again.");
  const row = (Array.isArray(data) ? data[0] : data) as { pro_until: string; campaign: string; pro_months: number } | undefined;
  if (!row) throw new Error("Couldn't claim the code. Try again.");
  clearPendingCode();
  return { proUntil: Date.parse(row.pro_until), campaign: row.campaign, proMonths: row.pro_months };
}

/** The signed-in rider's Pro status, from the server. Null if free, offline or not signed in. */
export async function fetchPro(): Promise<{ until: number; source: string | null } | null> {
  const sb = getSupabase();
  if (!sb || !navigator.onLine) return null;
  const { data } = await sb.from("subscriptions").select("plan,status,current_period_end,source").maybeSingle();
  if (!data || data.plan !== "pro" || data.status !== "active" || !data.current_period_end) return null;
  const until = Date.parse(data.current_period_end as string);
  return until > Date.now() ? { until, source: (data.source as string | null) ?? null } : null;
}

/** "promo:bacup-mx" → "Bacup MX". Each track's codes are a campaign named after the track. */
export function campaignLabel(campaign: string | null | undefined): string | null {
  const c = (campaign ?? "").replace(/^promo:/, "");
  if (!c) return null;
  if (c.startsWith("bacup")) return "Bacup MX";
  return c.split("-").filter(Boolean)
    .map((w) => (w === "mx" ? "MX" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
