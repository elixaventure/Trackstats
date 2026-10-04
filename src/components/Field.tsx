import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const input = "w-full min-h-12 rounded-xl border border-line bg-surface-2 px-3 text-ink placeholder:text-muted/70 focus:border-plate focus:outline-none";

function Wrap({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function TextField({ label, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return <Wrap id={id} label={label} hint={hint}><input id={id} className={input} {...rest} /></Wrap>;
}

export function SelectField({ label, hint, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return <Wrap id={id} label={label} hint={hint}><select id={id} className={`${input} appearance-none`} {...rest}>{children}</select></Wrap>;
}

export function TextArea({ label, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return <Wrap id={id} label={label} hint={hint}><textarea id={id} className={`${input} min-h-24 py-3`} {...rest} /></Wrap>;
}

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left">
      <span>
        <span className="block font-semibold">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-plate" : "bg-line"}`}>
        <span className={`absolute top-1 size-6 rounded-full bg-bg transition-all ${checked ? "left-7" : "left-1"}`} />
      </span>
    </button>
  );
}
