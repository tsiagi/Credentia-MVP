// components/admin/BrandingCard.tsx
// Shared company-branding control: logo upload + brand colour. Presentational —
// the parent supplies initial values and an async onSave so the same card serves
// company-admin "Color settings" and superadmin per-company branding.
"use client";

import React, { useState } from "react";
import { ImageIcon, Palette, Check } from "lucide-react";
import { Card, useToast } from "@/components/ui";

const SWATCHES = ["#6B7FC0", "#E07C5E", "#8E7CB0", "#6E7A4F", "#C28A2C", "#0f6e5c"];

export interface BrandingCardProps {
  logoUrl: string | null;
  brandColor: string | null;
  /** Persist a partial branding change. Throw to surface an error toast. */
  onSave: (patch: { logo_url?: string; brand_color?: string }) => Promise<void>;
  title?: string;
  description?: string;
}

export function BrandingCard({ logoUrl, brandColor, onSave, title, description }: BrandingCardProps) {
  const toast = useToast();
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [color, setColor] = useState<string>(brandColor ?? SWATCHES[0]);
  const [savingColor, setSavingColor] = useState(false);

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        await onSave({ logo_url: dataUrl });
        setLogo(dataUrl);
        toast.success("Logo updated — audit logged.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save logo.");
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveColor(next: string) {
    setColor(next);
    setSavingColor(true);
    try {
      await onSave({ brand_color: next });
      toast.success("Brand colour updated — audit logged.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save colour.");
    } finally {
      setSavingColor(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={18} style={{ color: "var(--accent)" }} />
        <h3 className="font-semibold">{title ?? "Company branding"}</h3>
      </div>
      <p className="text-[13px] mb-4" style={{ color: "var(--ink-3)" }}>
        {description ?? "Logo and accent colour shown in the app shell for this company."}
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="Company logo" className="h-12 w-auto max-w-[160px] object-contain rounded-lg border p-1" style={{ borderColor: "var(--line)" }} />
        ) : (
          <div className="h-12 w-12 rounded-lg flex items-center justify-center border" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }}>
            <ImageIcon size={20} style={{ color: "var(--ink-3)" }} />
          </div>
        )}
        <label
          className="cairn-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-sm)] text-[12px] font-semibold border cursor-pointer"
          data-variant="secondary"
        >
          <ImageIcon size={14} /> Upload logo
          <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
        </label>
      </div>

      <div>
        <div className="cairn-eyebrow mb-2">Brand colour</div>
        <div className="flex items-center gap-2 flex-wrap">
          {SWATCHES.map((s) => {
            const active = color.toLowerCase() === s.toLowerCase();
            return (
              <button key={s} type="button" disabled={savingColor} onClick={() => saveColor(s)}
                aria-label={`Set brand colour ${s}`}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center transition disabled:opacity-50"
                style={{ background: s, borderColor: active ? "var(--ink)" : "transparent" }}>
                {active && <Check size={14} color="#fff" />}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
