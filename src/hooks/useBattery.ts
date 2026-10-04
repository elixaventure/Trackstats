import { useEffect, useState } from "react";

interface BatteryManagerLike extends EventTarget { level: number; charging: boolean }

/** Phone battery where the browser exposes it (Chrome/Android); null elsewhere, e.g. iOS Safari. */
export function useBattery() {
  const [b, setB] = useState<{ pct: number; charging: boolean } | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
    if (!nav.getBattery) return;
    let mgr: BatteryManagerLike | null = null;
    const read = () => mgr && setB({ pct: Math.round(mgr.level * 100), charging: mgr.charging });
    void nav.getBattery().then((m) => { mgr = m; read(); m.addEventListener("levelchange", read); m.addEventListener("chargingchange", read); });
    return () => { mgr?.removeEventListener("levelchange", read); mgr?.removeEventListener("chargingchange", read); };
  }, []);
  return b;
}
