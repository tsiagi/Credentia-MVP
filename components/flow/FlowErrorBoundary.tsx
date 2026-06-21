// components/flow/FlowErrorBoundary.tsx
// ─────────────────────────────────────────────────────────────
// Contains a render-time fault in a Flow section so it shows an inline,
// readable message instead of blanking the whole app. Error boundaries must be
// class components. Also logs the error to the console for diagnosis.
// ─────────────────────────────────────────────────────────────
"use client";

import React from "react";
import { TriangleAlert } from "lucide-react";

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

export class FlowErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surfaces in the browser console with a component stack for debugging.
    console.error("[Flow] render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="rounded-2xl border p-6" style={{ borderColor: "var(--danger-fg, #EF4444)", background: "var(--surface)" }}>
          <div className="inline-flex items-center gap-2 font-semibold text-[14px]" style={{ color: "var(--danger-fg, #EF4444)" }}>
            <TriangleAlert size={16} /> {this.props.label ?? "This section"} couldn’t render
          </div>
          <p className="text-[12.5px] mt-2 font-mono break-words" style={{ color: "var(--ink-2)" }}>
            {error.message || String(error)}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 inline-flex items-center text-[12.5px] font-medium rounded-lg px-3 py-1.5 transition active:scale-[0.98]"
            style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
