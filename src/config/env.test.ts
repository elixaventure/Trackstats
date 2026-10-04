import { describe, expect, it } from "vitest";
import { cleanEnvValue } from "./env";

describe("cleanEnvValue", () => {
  it("accepts a bare value or a whole line pasted from Supabase", () => {
    expect(cleanEnvValue("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(cleanEnvValue(" NEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co ")).toBe("https://abc.supabase.co");
    expect(cleanEnvValue('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_x1"')).toBe("sb_publishable_x1");
    expect(cleanEnvValue("VITE_SUPABASE_ANON_KEY = eyJhbGciOi.x.y")).toBe("eyJhbGciOi.x.y");
    expect(cleanEnvValue("")).toBeNull();
    expect(cleanEnvValue(undefined)).toBeNull();
  });
});
