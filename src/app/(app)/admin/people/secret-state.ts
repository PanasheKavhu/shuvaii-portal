/**
 * Result of an action that makes a one-time secret (a parent code or a
 * learner PIN): shown once to the admin, never stored readable.
 */
export type SecretState = {
  status: "idle" | "error" | "saved";
  message: string | null;
  secret: { label: string; value: string; details: string[] } | null;
};

export const noSecret: SecretState = { status: "idle", message: null, secret: null };
