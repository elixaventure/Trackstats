import { useState } from "react";
import { Button } from "@/components/Button";
import { roleLabel } from "@/domain/laps";
import type { TimingConfig } from "@/domain/types";
import { getSimulator } from "@/timing";

/**
 * Developer controls for the mock timing provider. Shown only when the active
 * provider is the simulator, and labelled as such.
 */
export function SimulatorPanel({ timing, tags }: { timing: TimingConfig; tags: { code: string; label: string }[] }) {
  const sim = getSimulator();
  const [open, setOpen] = useState(false);
  const [lapSec, setLapSec] = useState(20);
  const [, force] = useState(0);
  if (!sim || timing.mode === "gps") return null;
  const sequence = timing.pods.map((p) => p.podId);

  return (
    <section className="rounded-2xl border border-dashed border-warn/50 bg-surface p-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center justify-between font-mono text-sm font-semibold uppercase tracking-wide text-warn">
        Timing simulator (no hardware) <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-4">
          {tags.map((t) => (
            <div key={t.code} className="space-y-2">
              <div className="text-sm text-muted">Tag {t.code} · {t.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {timing.pods.map((p) => (
                  <Button key={p.podId} onClick={() => sim.fireCrossing(t.code, p.podId)}>
                    {t.code} crosses {roleLabel(p.role)}
                  </Button>
                ))}
              </div>
              <Button className="w-full" variant={sim.isAuto(t.code) ? "danger" : "secondary"}
                onClick={() => { if (sim.isAuto(t.code)) { sim.stopAutoLaps(t.code); } else { sim.startAutoLaps({ tagCode: t.code, sequence, lapMs: lapSec * 1000, jitterMs: lapSec * 80 }); } force((n) => n + 1); }}>
                {sim.isAuto(t.code) ? "Stop auto laps" : `Auto laps every ~${lapSec}s`}
              </Button>
            </div>
          ))}
          <label className="flex items-center gap-3 text-sm text-muted">
            Auto lap length
            <input type="range" min={8} max={150} value={lapSec} onChange={(e) => setLapSec(Number(e.target.value))} className="flex-1 accent-[#ffd21f]" />
            <span className="w-12 font-mono text-ink">{lapSec}s</span>
          </label>
        </div>
      )}
    </section>
  );
}
