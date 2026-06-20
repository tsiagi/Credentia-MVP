// components/ui/Button.tsx
// ─────────────────────────────────────────────────────────────
// Cairn button primitive. Variants map to design tokens only —
// never raw hex. Loading state shows a spinner and disables the
// button; `active:scale-[0.98]` gives the press micro-interaction.
// Presentation only — never touches data, queries, or RLS.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const SIZES: Record<ButtonSize, { pad: string; text: string; gap: string; icon: number }> = {
  sm: { pad: "px-2.5 py-1.5", text: "text-[12px]", gap: "gap-1.5", icon: 14 },
  md: { pad: "px-3.5 py-2",   text: "text-[13px]", gap: "gap-2",   icon: 15 },
  lg: { pad: "px-5 py-2.5",   text: "text-[15px]", gap: "gap-2",   icon: 17 },
};
// Variant colors (incl. hover) live in `.cairn-btn[data-variant]` rules in
// styles/cairn/tokens/base.css so hover can override the resting color.

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      data-variant={variant}
      className={cn(
        "cairn-btn inline-flex items-center justify-center font-semibold border",
        "rounded-[var(--radius-sm)] select-none whitespace-nowrap",
        "transition-[transform,background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
        "active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none",
        s.pad, s.text, s.gap,
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 size={s.icon} className="animate-spin shrink-0" aria-hidden />
      ) : (
        leadingIcon && <span className="shrink-0 inline-flex" aria-hidden>{leadingIcon}</span>
      )}
      {children != null && <span>{children}</span>}
      {!loading && trailingIcon && <span className="shrink-0 inline-flex" aria-hidden>{trailingIcon}</span>}
    </button>
  );
});
