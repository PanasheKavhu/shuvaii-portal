"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  COLOR_MODE_KEY,
  isColorMode,
  resolveDark,
  type ColorMode,
} from "@/lib/branding/color-mode";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: ColorMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "System", Icon: Monitor },
];

function apply(mode: ColorMode) {
  const dark = resolveDark(mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Light / dark / system switch. The choice is remembered on this device. */
export function ColorModeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<ColorMode | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(COLOR_MODE_KEY);
    } catch {}
    // Reading localStorage is only possible after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(isColorMode(stored) ? stored : "system");
  }, []);

  useEffect(() => {
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode]);

  function choose(next: ColorMode) {
    setMode(next);
    try {
      localStorage.setItem(COLOR_MODE_KEY, next);
    } catch {}
    apply(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour mode"
      className={cn("bg-muted inline-flex rounded-full p-1", className)}
    >
      {OPTIONS.map(({ mode: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={mode === option}
          aria-label={label}
          title={label}
          onClick={() => choose(option)}
          className={cn(
            "text-muted-foreground focus-visible:ring-ring/50 inline-flex size-9 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3",
            mode === option && "bg-background text-foreground shadow-sm",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
