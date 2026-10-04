import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "xl";

const base = "inline-flex items-center justify-center gap-2 rounded-xl font-semibold select-none transition-colors disabled:opacity-40 disabled:pointer-events-none";
const variants: Record<Variant, string> = {
  primary: "bg-plate text-plate-ink hover:bg-[#ffdc4d] active:bg-[#e6bd16]",
  secondary: "bg-surface-2 text-ink border border-line hover:border-muted active:bg-line",
  ghost: "text-ink hover:bg-surface-2 active:bg-line",
  danger: "bg-slower/15 text-slower border border-slower/40 hover:bg-slower/25",
};
// Every size clears the 48px glove-friendly minimum.
const sizes: Record<Size, string> = {
  md: "min-h-12 px-4 text-base",
  lg: "min-h-14 px-5 text-lg",
  xl: "min-h-18 px-6 text-xl font-display font-extrabold uppercase tracking-wide",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({ variant = "secondary", size = "md", className = "", ...rest }: LinkProps & { variant?: Variant; size?: Size; children: ReactNode }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}
