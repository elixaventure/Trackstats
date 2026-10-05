import { describe, expect, it } from "vitest";
import { formatSpeedKph, formatSpeedMps } from "./time";

describe("speed display", () => {
  it("shows mph", () => {
    expect(formatSpeedKph(80)).toBe("50 mph");
    expect(formatSpeedMps(20)).toBe("45 mph"); // 72 km/h
    expect(formatSpeedKph(null)).toBe("—");
  });
});
