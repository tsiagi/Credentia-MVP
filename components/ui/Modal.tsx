"use client";
// components/ui/Modal.tsx
// ─────────────────────────────────────────────────────────────
// Centered dialog: backdrop blur + scale-in, close button,
// ESC-to-close, focus trap-lite (initial focus + scroll lock).
// Presentation only.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer actions, rendered right-aligned. */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Hide the top-right close button. */
  hideClose?: boolean;
  className?: string;
}

const SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideClose = false,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const title_id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--espresso-900) 42%, transparent)", backdropFilter: "blur(4px)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? title_id : undefined}
        className={cn(
          "cairn-pop w-full outline-none rounded-[var(--radius-lg)] border",
          SIZE[size],
          className,
        )}
        style={{ background: "var(--surface)", borderColor: "var(--line)", boxShadow: "var(--shadow-xl)" }}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              {title && (
                <h2 id={title_id} className="text-[16px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
                  {title}
                </h2>
              )}
              {description && (
                <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--surface-2)]"
                style={{ color: "var(--ink-3)" }}
              >
                <X size={17} />
              </button>
            )}
          </div>
        )}
        {children != null && <div className="px-6 py-2 text-[13px]" style={{ color: "var(--ink-2)" }}>{children}</div>}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
