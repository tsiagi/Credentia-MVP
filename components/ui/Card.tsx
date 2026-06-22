// components/ui/Card.tsx
// ─────────────────────────────────────────────────────────────
// Core-Roborate surface primitives: Card + CardHeader / CardTitle / CardBody.
// `interactive` adds the hover lift used by clickable cards.
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React from "react";
import { cn } from "./cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + pointer affordance for clickable cards. */
  interactive?: boolean;
  /** Card padding preset. Use `none` when the body manages its own padding. */
  padding?: "none" | "sm" | "md" | "lg";
}

const PAD: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, padding = "none", className, style, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-lg)] border",
        interactive && "core-roborate-lift cursor-pointer",
        PAD[padding],
        className,
      )}
      style={{
        background: "var(--surface)",
        borderColor: "var(--line)",
        boxShadow: "var(--shadow-sm)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
});

export function CardHeader({
  className,
  children,
  action,
  divider = true,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { action?: React.ReactNode; divider?: boolean }) {
  return (
    <div
      className={cn("flex items-start justify-between gap-4 px-6 py-4", divider && "border-b", className)}
      style={divider ? { borderColor: "var(--line)" } : undefined}
      {...rest}
    >
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-[15px] font-semibold leading-tight", className)} style={{ color: "var(--ink)" }} {...rest}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("mt-0.5 text-[12px]", className)} style={{ color: "var(--ink-3)" }} {...rest}>
      {children}
    </p>
  );
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...rest}>
      {children}
    </div>
  );
}
