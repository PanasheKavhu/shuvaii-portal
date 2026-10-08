/** Result of a form's server action (console, setup, people), shown beside the form. */
export type FormState = {
  status: "idle" | "error" | "saved";
  message: string | null;
  errors: Record<string, string | undefined>;
};

export const idle: FormState = { status: "idle", message: null, errors: {} };

export const saved = (message: string): FormState => ({ status: "saved", message, errors: {} });

export const failed = (message: string | null, errors: FormState["errors"] = {}): FormState => ({
  status: "error",
  message,
  errors,
});

/** The refusal for someone without the role an action needs, e.g. "a school admin". */
export const notAllowed = (who: string): FormState => failed(`Only ${who} can do this.`);
