/** The setup wizard's steps for one year (US-2.1), as paths under /admin/setup/[yearId]. */
export const SETUP_STEPS = [
  { path: "/terms", label: "Year and terms" },
  { path: "/grading", label: "Grading scales" },
  { path: "/levels", label: "Grade levels" },
  { path: "/subjects", label: "Subjects" },
  { path: "/classes", label: "Classes and class teachers" },
  { path: "/class-subjects", label: "Class subjects and teachers" },
  { path: "", label: "Check and finish" },
] as const;

/** Which step a path belongs to; a single class's page is part of "Class subjects". */
export function stepIndexFor(pathname: string, yearId: string): number {
  const base = `/admin/setup/${yearId}`;
  if (pathname === base) return SETUP_STEPS.length - 1;
  if (pathname.startsWith(`${base}/classes/`)) return 5;
  return SETUP_STEPS.findIndex((s) => s.path !== "" && pathname.startsWith(base + s.path));
}
