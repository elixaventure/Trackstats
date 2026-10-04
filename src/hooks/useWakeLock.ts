import { useEffect, useState } from "react";

/** Keep the screen on during a ride (browsers also pause GPS when the screen sleeps). */
export function useWakeLock(enabled: boolean) {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) { void lock.release(); return; }
        setHeld(true);
        lock.addEventListener("release", () => setHeld(false));
      } catch { setHeld(false); }
    };
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); void lock?.release(); };
  }, [enabled]);
  return held;
}
