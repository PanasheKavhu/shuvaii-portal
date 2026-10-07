/** Light/dark mode preference (per device, in localStorage). Pure. */
export const COLOR_MODES = ["system", "light", "dark"] as const;
export type ColorMode = (typeof COLOR_MODES)[number];

export const COLOR_MODE_KEY = "sp-color-mode";

export function isColorMode(value: unknown): value is ColorMode {
  return typeof value === "string" && (COLOR_MODES as readonly string[]).includes(value);
}

/** Whether the page should be dark for this preference. */
export function resolveDark(mode: ColorMode, systemPrefersDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark);
}

/**
 * Runs in <head> before first paint so a dark-mode user never sees a white
 * flash. Kept tiny and dependency-free; mirrors resolveDark().
 */
export const COLOR_MODE_SCRIPT = `(function(){try{var m=localStorage.getItem(${JSON.stringify(
  COLOR_MODE_KEY,
)});var d=m==="dark"||((m!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
