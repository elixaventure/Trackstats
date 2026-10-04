import { useRef, useState } from "react";

/** Press-and-hold to confirm. Stops a glove brushing "Finish" mid-lap. */
export function HoldButton({ label, onConfirm, holdMs = 1200, className = "" }: { label: string; onConfirm: () => void; holdMs?: number; className?: string }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const started = useRef(0);

  const tick = () => {
    const p = Math.min(1, (Date.now() - started.current) / holdMs);
    setProgress(p);
    if (p >= 1) { stop(); onConfirm(); return; }
    timer.current = requestAnimationFrame(tick);
  };
  const begin = () => { started.current = Date.now(); timer.current = requestAnimationFrame(tick); };
  const stop = () => { if (timer.current) cancelAnimationFrame(timer.current); timer.current = null; setProgress(0); };

  return (
    <button type="button" onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); begin(); }} onPointerUp={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) begin(); }} onKeyUp={stop}
      aria-label={`${label} (press and hold)`}
      className={`relative min-h-20 overflow-hidden rounded-2xl border-2 border-slower bg-slower/10 font-display text-2xl font-extrabold uppercase tracking-wide text-slower select-none ${className}`}>
      <span className="absolute inset-y-0 left-0 bg-slower/35" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{progress > 0 ? "Keep holding…" : `Hold to ${label}`}</span>
    </button>
  );
}
