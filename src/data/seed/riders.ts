import type { Bike, Group, GroupMember, RiderProfile, Transponder, TransponderAssignment } from "@/domain/types";
import { stableUuid } from "@/lib/id";

const id = (k: string) => stableUuid(k);

export function demoPeople(userId: string, now: number) {
  const created = now - 70 * 86400000;
  const rider = (key: string, owner: string, p: Partial<RiderProfile> & Pick<RiderProfile, "name" | "username" | "raceNumber" | "riderClass">): RiderProfile => ({
    id: id(`rider:${key}`), ownerUserId: owner, ageCategory: null, homeRegion: "Lancashire", imageDataUrl: null,
    visibility: "public", defaultBikeId: null, createdAt: created, ...p,
  });

  const joel = rider("joel", userId, { name: "Joel Gaffey", username: "joelgaffey777", raceNumber: "777", riderClass: "MX2 Clubman", ageCategory: "Senior" });
  const charlie = rider("charlie", userId, { name: "Charlie Turner", username: "charlie77", raceNumber: "77", riderClass: "Youth 85", ageCategory: "Under 13", visibility: "private" });
  const friends = [
    rider("jake", id("user:jake"), { name: "Jake Hollis", username: "jakeh14", raceNumber: "14", riderClass: "MX1 Expert" }),
    rider("sam", id("user:sam"), { name: "Sam Pearce", username: "sampearce", raceNumber: "33", riderClass: "MX2 Clubman" }),
    rider("ellie", id("user:ellie"), { name: "Ellie Ward", username: "ellie8", raceNumber: "8", riderClass: "Ladies" }),
    rider("dan", id("user:dan"), { name: "Dan Kerr", username: "dankerr", raceNumber: "51", riderClass: "Vets" }),
  ];

  const bike = (key: string, riderId: string, b: Omit<Bike, "id" | "riderId" | "imageDataUrl" | "archived">): Bike => ({
    id: id(`bike:${key}`), riderId, imageDataUrl: null, archived: false, ...b,
  });
  const tc125 = bike("tc125", joel.id, { manufacturer: "Husqvarna", model: "TC 125", capacity: "125cc 2T", bikeClass: "MX2", year: 2026, nickname: null, startHours: 0, vin: null,
    parts: {
      engineOil: { brand: "Motorex", product: "Gear Oil 10W-30" },
      airFilter: { brand: "Twin Air", product: "" },
      sparkPlug: { brand: "NGK", product: "" },
    },
    mods: [] });
  const yz250f = bike("yz250f", joel.id, { manufacturer: "Yamaha", model: "YZ250F", capacity: "250cc 4T", bikeClass: "MX2", year: 2021, nickname: null, vin: "DEMO0000000000777",
    parts: {
      engineOil: { brand: "Motorex", product: "Cross Power 4T 10W-50" },
      oilFilter: { brand: "Hiflofiltro", product: "" },
      airFilter: { brand: "Twin Air", product: "" },
      piston: { brand: "Wiseco", product: "" },
      chain: { brand: "DID", product: "520 ERT3" },
      sprockets: { brand: "Renthal", product: "" },
      rearTyre: { brand: "Dunlop", product: "Geomax MX34 110/90-19" },
    },
    mods: [] });
  const ktm85 = bike("ktm85", charlie.id, { manufacturer: "KTM", model: "85 SX", capacity: "85cc 2T", bikeClass: "Youth 85", year: 2023, nickname: null });
  joel.defaultBikeId = yz250f.id;
  charlie.defaultBikeId = ktm85.id;

  const family: Group = { id: id("group:family"), name: "Family", kind: "family", createdByUserId: userId, createdAt: created };
  const crew: Group = { id: id("group:crew"), name: "Sunday Crew", kind: "friends", createdByUserId: userId, createdAt: created };
  const member = (g: Group, r: RiderProfile, role: GroupMember["role"]): GroupMember => ({ id: id(`gm:${g.id}:${r.id}`), groupId: g.id, riderId: r.id, role, joinedAt: created });
  const members = [
    member(family, joel, "manager"), member(family, charlie, "rider"),
    member(crew, joel, "manager"), ...friends.map((f) => member(crew, f, "rider")),
  ];

  const tag = (key: string, t: Omit<Transponder, "id" | "status">): Transponder => ({ id: id(`tag:${key}`), status: "active", ...t });
  const personal = tag("001", { code: "001", nickname: "Joel's tag", ownership: "personal", ownerRiderId: joel.id, ownerGroupId: null, batteryPct: 82, lastSeenAt: null });
  const shared1 = tag("T01", { code: "T01", nickname: "Crew Tag 01", ownership: "shared", ownerRiderId: null, ownerGroupId: crew.id, batteryPct: 64, lastSeenAt: null });
  const shared2 = tag("T02", { code: "T02", nickname: "Crew Tag 02", ownership: "shared", ownerRiderId: null, ownerGroupId: crew.id, batteryPct: 41, lastSeenAt: null });
  const assignments: TransponderAssignment[] = [
    { id: id("assign:joel-001"), transponderId: personal.id, riderId: joel.id, assignedByUserId: userId, assignedAt: now - 32 * 86400000, releasedAt: null },
  ];

  return { joel, charlie, friends, bikes: { tc125, yz250f, ktm85 }, groups: { family, crew }, members, tags: { personal, shared1, shared2 }, assignments };
}
