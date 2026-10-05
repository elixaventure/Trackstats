import { describe, expect, it } from "vitest";
import { formatMiles, formatSpeedKph, formatSpeedMps } from "./time";

describe("speed display", () => {
  it("shows mph", () => {
    expect(formatSpeedKph(80)).toBe("50 mph");
    expect(formatSpeedMps(20)).toBe("45 mph"); // 72 km/h
    expect(formatSpeedKph(null)).toBe("—");
  });
  it("shows ride totals in miles", () => {
    expect(formatMiles(16093)).toBe("10 mi");
    expect(formatMiles(4828)).toBe("3.0 mi");
    expect(formatMiles(null)).toBe("—");
  });
});
