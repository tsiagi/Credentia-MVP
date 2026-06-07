"use client";

import { useEffect, useState } from "react";

export type ColorScheme = "light" | "dark";

/** Follow the device/OS light or dark preference via prefers-color-scheme. */
export function usePrefersColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function sync() {
      setScheme(mq.matches ? "dark" : "light");
    }

    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return scheme;
}
