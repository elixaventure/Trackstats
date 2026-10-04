import type { RiderProfile } from "@/domain/types";

/** Number-plate style race number, or a photo if the rider has one. */
export function Plate({ rider, size = "md" }: { rider: Pick<RiderProfile, "raceNumber" | "imageDataUrl" | "name">; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? "size-20 text-4xl" : size === "sm" ? "size-10 text-lg" : "size-14 text-2xl";
  if (rider.imageDataUrl) return <img src={rider.imageDataUrl} alt={rider.name} className={`${dim} shrink-0 rounded-xl object-cover`} />;
  return (
    <span aria-hidden="true" className={`${dim} grid shrink-0 place-items-center rounded-xl bg-plate font-display font-black text-plate-ink`}>
      {rider.raceNumber || rider.name.slice(0, 1) || "?"}
    </span>
  );
}
