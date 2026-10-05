import { describe, expect, it } from "vitest";
import { campaignLabel, normaliseCode } from "./promo";

describe("promo codes", () => {
  it("names the track a code came from", () => {
    expect(campaignLabel("promo:bacup-mx")).toBe("Bacup MX");
    expect(campaignLabel("promo:bacup-launch")).toBe("Bacup MX");
    expect(campaignLabel("promo:hawkstone-park-mx")).toBe("Hawkstone Park MX");
    expect(campaignLabel(null)).toBeNull();
  });
  it("tidies typed codes", () => {
    expect(normaliseCode(" track-ab23 cd45 ")).toBe("TRACK-AB23CD45");
  });
});
