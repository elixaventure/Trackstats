import { useMemo } from "react";
import { bikeHours, scheduleStatus } from "@/domain/service";
import { useDb } from "./useDb";

/** Hours, schedule status and history for one bike. */
export function useBikeService(bikeId: string | undefined) {
  const db = useDb();
  return useMemo(() => {
    const bike = bikeId ? db.bikes[bikeId] : undefined;
    if (!bike) return null;
    const records = Object.values(db.serviceRecords).filter((r) => r.bikeId === bike.id).sort((a, b) => b.performedAt - a.performedAt);
    const tasks = Object.values(db.serviceTasks).filter((t) => t.bikeId === bike.id).sort((a, b) => a.sortOrder - b.sortOrder);
    const hours = bikeHours(bike, Object.values(db.sessions), records);
    return { bike, records, tasks, hours, status: scheduleStatus(tasks, records, hours.total) };
  }, [db.bikes, db.serviceRecords, db.serviceTasks, db.sessions, bikeId]);
}
