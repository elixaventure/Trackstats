import type { Bike, Group, GroupMember, RiderProfile, Transponder, TransponderAssignment } from "@/domain/types";
import { stableUuid } from "@/lib/id";

const id = (k: string) => stableUuid(k);

export function demoPeople(userId: string, now: number) {
  const created = now - 70 * 86400000;
  const rider = (key: string, owner: string, p: Partial<RiderProfile> & Pick<RiderProfile, "name" | "username" | "raceNumber" | "riderClass">): RiderProfile => ({
    id: id(`rider:${key}`), ownerUserId: owner, ageCategory: null, homeRegion: "Lancashire", imageDataUrl: null,
    visibility: "public", defaultBikeId: null, createdAt: created, ...p,
  });

  const alex = rider("alex", userId, { name: "Alex Turner", username: "alexturner221", raceNumber: "221", riderClass: "MX2 Clubman", ageCategory: "Senior" });
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
  const crf = bike("crf250r", alex.id, { manufacturer: "Honda", model: "CRF250R", capacity: "250cc 4T", bikeClass: "MX2", year: 2024, nickname: "The Red One" });
  const ktm350 = bike("ktm350", alex.id, { manufacturer: "KTM", model: "350 EXC-F", capacity: "350cc 4T", bikeClass: "Enduro E2", year: 2022, nickname: null });
  const ktm85 = bike("ktm85", charlie.id, { manufacturer: "KTM", model: "85 SX", capacity: "85cc 2T", bikeClass: "Youth 85", year: 2023, nickname: null });
  alex.defaultBikeId = crf.id;
  charlie.defaultBikeId = ktm85.id;

  const family: Group = { id: id("group:family"), name: "Turner Family", kind: "family", createdByUserId: userId, createdAt: created };
  const crew: Group = { id: id("group:crew"), name: "Sunday Crew", kind: "friends", createdByUserId: userId, createdAt: created };
  const member = (g: Group, r: RiderProfile, role: GroupMember["role"]): GroupMember => ({ id: id(`gm:${g.id}:${r.id}`), groupId: g.id, riderId: r.id, role, joinedAt: created });
  const members = [
    member(family, alex, "manager"), member(family, charlie, "rider"),
    member(crew, alex, "manager"), ...friends.map((f) => member(crew, f, "rider")),
  ];

  const tag = (key: string, t: Omit<Transponder, "id" | "status">): Transponder => ({ id: id(`tag:${key}`), status: "active", ...t });
  const personal = tag("001", { code: "001", nickname: "Alex's tag", ownership: "personal", ownerRiderId: alex.id, ownerGroupId: null, batteryPct: 82, lastSeenAt: null });
  const shared1 = tag("T01", { code: "T01", nickname: "Crew Tag 01", ownership: "shared", ownerRiderId: null, ownerGroupId: crew.id, batteryPct: 64, lastSeenAt: null });
  const shared2 = tag("T02", { code: "T02", nickname: "Crew Tag 02", ownership: "shared", ownerRiderId: null, ownerGroupId: crew.id, batteryPct: 41, lastSeenAt: null });
  const assignments: TransponderAssignment[] = [
    { id: id("assign:alex-001"), transponderId: personal.id, riderId: alex.id, assignedByUserId: userId, assignedAt: now - 32 * 86400000, releasedAt: null },
  ];

  return { alex, charlie, friends, bikes: { crf, ktm350, ktm85 }, groups: { family, crew }, members, tags: { personal, shared1, shared2 }, assignments };
}
