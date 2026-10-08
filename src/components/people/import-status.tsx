import { StatusPill } from "@/components/people/status-pill";

export const IMPORT_KIND_LABEL = { staff: "Staff", learners: "Learners", marks: "Marks" } as const;

/** An import job's state in a word or two (import_jobs.status). */
export function ImportStatus({ status }: { status: "validated" | "committed" | "failed" }) {
  if (status === "committed") return <StatusPill tone="good">Imported</StatusPill>;
  if (status === "failed") return <StatusPill tone="muted">Not imported</StatusPill>;
  return <StatusPill tone="warn">Checked, waiting</StatusPill>;
}
