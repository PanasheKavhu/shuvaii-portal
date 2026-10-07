"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { brandTheme, themeCss, type SchoolBranding } from "@/lib/branding/theme";

type SchoolTheme = { schoolName: string | null; branding: SchoolBranding; logoUrl: string | null };

const SchoolThemeContext = createContext<SchoolTheme>({
  schoolName: null,
  branding: { logoPath: null, primaryColor: null, accentColor: null },
  logoUrl: null,
});

/** The active school's name, branding and logo URL, for client components. */
export function useSchoolTheme(): SchoolTheme {
  return useContext(SchoolThemeContext);
}

/**
 * Applies a school's colours (US-1.5) as CSS variables for light and dark
 * mode, and shares the branding with the components below it. Colours come
 * from the database at request time, so a change shows without a deploy.
 */
export function ThemeProvider({
  schoolName,
  branding,
  logoUrl,
  children,
}: SchoolTheme & { children: ReactNode }) {
  const css = useMemo(() => themeCss(brandTheme(branding)), [branding]);
  const value = useMemo(() => ({ schoolName, branding, logoUrl }), [schoolName, branding, logoUrl]);

  return (
    <SchoolThemeContext value={value}>
      {css && <style data-school-theme>{css}</style>}
      {children}
    </SchoolThemeContext>
  );
}
