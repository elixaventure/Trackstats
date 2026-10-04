import { describe, expect, it } from "vitest";
import { generateDemo } from "@/data/seed/generate";
import { cleanVin, partQuery, rememberParts, slotsFor, slotsForTask, taskQuery, vinLooksRight } from "../parts";
import { defaultSchedule } from "../service";
import type { Bike } from "../types";

const { state } = generateDemo("u", Date.UTC(2026, 9, 4));
const bikes = Object.values(state.bikes);
const yz = bikes.find((b) => b.model === "YZ250F")!;
const tc = bikes.find((b) => b.model === "TC 125")!;

describe("part slots", () => {
  it("names the 2-stroke's oil gearbox oil and drops the oil filter", () => {
    const labels = slotsFor(tc).map((s) => s.label);
    expect(labels).toContain("Gearbox oil");
    expect(labels).not.toContain("Oil filter");
    expect(slotsFor(yz).map((s) => s.label)).toEqual(expect.arrayContaining(["Engine oil", "Oil filter"]));
  });

  it("maps every default job that uses parts, and none that don't", () => {
    const yzJobs = Object.fromEntries(defaultSchedule(yz).map((t) => [t.name, slotsForTask(t.name, yz)]));
    expect(yzJobs["Engine oil & filter"]).toEqual(["engineOil", "oilFilter"]);
    expect(yzJobs["Air filter clean & oil"]).toEqual(["airFilter"]);
    expect(yzJobs["Chain & sprockets check / adjust"]).toEqual(["chain", "sprockets"]);
    expect(yzJobs["Brake pads & fluid check"]).toEqual(["frontPads", "rearPads"]);
    expect(yzJobs["Valve clearance check"]).toEqual([]);
    expect(yzJobs["Suspension service (forks & shock)"]).toEqual([]);
    expect(slotsForTask("Top end (piston & rings)", tc)).toEqual(["piston"]);
    expect(slotsForTask("Gearbox oil", tc)).toEqual(["engineOil"]);
    expect(slotsForTask("Fork oil", yz)).toEqual([]);
  });
});

describe("shop searches", () => {
  it("searches the rider's own brand, with the bike only when fitment matters", () => {
    expect(partQuery(yz, "engineOil")).toBe("Motorex Cross Power 4T 10W-50");
    expect(partQuery(yz, "chain")).toBe("DID 520 ERT3 2021 Yamaha YZ250F");
    expect(partQuery(yz, "frontPads")).toBe("2021 Yamaha YZ250F front brake pads");
    expect(partQuery(yz, "oilFilter")).toBe("Hiflofiltro oil filter 2021 Yamaha YZ250F");
    expect(taskQuery(yz, "Engine oil & filter")).toBe("Motorex Cross Power 4T 10W-50");
    expect(taskQuery(yz, "Valve clearance check")).toBeNull();
  });

  it("remembers parts used in a service without wiping the others", () => {
    const parts = rememberParts(yz, { engineOil: { brand: " Putoline ", product: "MX 10W-50" }, chain: { brand: "", product: "" } });
    expect(parts!.engineOil).toEqual({ brand: "Putoline", product: "MX 10W-50" });
    expect(parts!.chain).toEqual(yz.parts!.chain);
    expect(rememberParts({ capacity: "" } as Bike, {})).toEqual({});
  });
});

describe("chassis number", () => {
  it("cleans and sanity-checks it", () => {
    expect(cleanVin(" jya cg31c0 ma000777 ")).toBe("JYACG31C0MA000777");
    expect(vinLooksRight("JYACG31C0MA000777")).toBe(true);
    expect(vinLooksRight("JYACG31C0MA00077")).toBe(false);
    expect(vinLooksRight("IYACG31C0MA000777")).toBe(false);
  });
});
