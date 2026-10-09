import { StatusPill } from "@/components/people/status-pill";

/** A marks upload's state in a word or two (import_jobs.status, D33). */
export function MarksUploadStatus({ status }: { status: "validated" | "committed" | "failed" }) {
  if (status === "committed") return <StatusPill tone="good">Saved</StatusPill>;
  if (status === "failed") return <StatusPill tone="muted">Not saved</StatusPill>;
  return <StatusPill tone="warn">Checked, not saved yet</StatusPill>;
}
