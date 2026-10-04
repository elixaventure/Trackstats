export interface SegOption<T extends string> { value: T; label: string; disabled?: boolean; hint?: string }

/** Large radio-group buttons. Wraps on small screens instead of shrinking targets. */
export function Segmented<T extends string>({ label, options, value, onChange, columns = 2 }: {
  label: string; options: SegOption<T>[]; value: T; onChange: (v: T) => void; columns?: 2 | 3 | 4 | 5;
}) {
  const cols = columns === 5 ? "grid-cols-3 sm:grid-cols-5" : columns === 4 ? "grid-cols-4" : columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <fieldset>
      <legend className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</legend>
      <div role="radiogroup" className={`grid gap-2 ${cols}`}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={o.disabled}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={`min-h-14 rounded-xl border px-3 py-2 text-left text-[15px] font-semibold leading-tight transition-colors disabled:opacity-35 ${
                on ? "border-plate bg-plate/10 text-ink" : "border-line bg-surface-2 text-ink hover:border-muted"
              }`}
            >
              {o.label}
              {o.disabled && o.hint && <span className="mt-0.5 block text-xs font-normal text-muted">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
