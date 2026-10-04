import { useId, useState } from "react";
import { resizeImage } from "@/lib/image";

export function ImagePicker({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <span className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</span>
      <div className="flex items-center gap-3">
        {value ? <img src={value} alt="" className="size-20 rounded-xl object-cover" /> : <div className="grid size-20 place-items-center rounded-xl bg-surface-2 text-sm text-muted">None</div>}
        <label htmlFor={id} className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-line bg-surface-2 px-4 font-semibold">Choose photo</label>
        <input id={id} type="file" accept="image/*" className="sr-only" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { setError(null); onChange(await resizeImage(f)); } catch { setError("Couldn't read that image."); }
        }} />
        {value && <button type="button" className="min-h-12 px-3 text-muted" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {error && <p className="mt-1 text-sm text-slower">{error}</p>}
      <p className="mt-1 text-xs text-muted">Stored on this device for now.</p>
    </div>
  );
}
