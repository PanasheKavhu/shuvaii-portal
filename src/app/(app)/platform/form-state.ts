/** Result of a super-admin console form action, shown beside the form. */
export type FormState = {
  status: "idle" | "error" | "saved";
  message: string | null;
  errors: Record<string, string | undefined>;
};

export const idle: FormState = { status: "idle", message: null, errors: {} };
