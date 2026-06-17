// app/dev/manager/page.tsx
// TEMPORARY preview route for the redesigned Manager Dashboard (EmployerSide).
// Safe to delete — not linked from anywhere and not part of the marketing site.
"use client";

import EmployerSide from "@/components/EmployerSide";

export default function ManagerDashboardPreview() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--content-bg, var(--bg))" }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <div className="cairn-eyebrow mb-2">Preview · Manager</div>
          <h1 className="text-[28px] font-semibold" style={{ color: "var(--ink)" }}>
            Manager Dashboard
          </h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--ink-3)" }}>
            Redesigned presentation — same data &amp; state as before.
          </p>
        </div>
        <EmployerSide role="manager" />
      </div>
    </div>
  );
}
