"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SaveCommentResult } from "@/app/(app)/marks/comment-actions";
import type { SavedComment } from "@/app/(app)/marks/comment-data";
import { charactersLeft, checkComment, suggestionsFor, type BankEntry } from "@/lib/comments/rules";
import { cn } from "@/lib/utils";

type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "failed"; message: string };

const SAVE_DELAY_MS = 800;

/**
 * One learner's comment (US-5.1, US-5.3): a text box that saves a draft
 * shortly after typing stops (and on leaving it), a character count for the
 * report's limit, "Done" (submitted and signed), suggestions from the
 * comment bank matched to the learner's grade (picking one puts editable
 * text in the box, US-5.2), and "Save to my bank". Changing a comment that
 * was done saves it as a draft again.
 */
export function CommentBox({
  label,
  initial,
  max,
  readOnly,
  bank,
  subjectId,
  grade,
  save,
  saveToBank,
}: {
  /** Accessible name, e.g. "Teacher's comment for Chipo Moyo". */
  label: string;
  initial: SavedComment | undefined;
  max: number;
  readOnly: boolean;
  bank: readonly BankEntry[];
  /** For suggestions: the subject, or null for a class comment. */
  subjectId: string | null;
  /** The learner's grade, for suggestions; null when there is none. */
  grade: string | null;
  save: (text: string, done: boolean) => Promise<SaveCommentResult>;
  saveToBank?: (text: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const id = useId();
  const [text, setText] = useState(initial?.text ?? "");
  const [done, setDone] = useState(initial?.status === "submitted");
  const [status, setStatus] = useState<SaveState>({ state: "idle" });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bankNote, setBankNote] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(!!initial?.text);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const savedRef = useRef({ text: initial?.text ?? "", done: initial?.status === "submitted" });
  const latest = useRef({ text, done });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  const suggestions = suggestionsFor(bank, { subjectId, grade, maxLength: max });
  const check = checkComment(text, max, done);

  async function flush() {
    clearTimeout(timer.current);
    const want = latest.current;
    const checked = checkComment(want.text, max, want.done);
    if (!checked.ok) return setStatus({ state: "failed", message: checked.message });
    if (checked.text === savedRef.current.text && want.done === savedRef.current.done) return;
    if (inFlight.current) return; // the running save re-checks when it ends

    inFlight.current = true;
    setStatus({ state: "saving" });
    let outcome: SaveCommentResult;
    try {
      outcome = await save(want.text, want.done);
    } catch {
      outcome = { ok: false, message: "Could not save. Check your connection and try again." };
    }
    inFlight.current = false;
    if (outcome.ok) {
      savedRef.current = {
        text: outcome.comment.text,
        done: outcome.comment.status === "submitted",
      };
      setHasSaved(outcome.comment.text !== "");
    }
    const now = latest.current;
    if (now.text !== want.text || now.done !== want.done) return void flush();
    if (outcome.ok) {
      setDone(outcome.comment.status === "submitted");
      latest.current = { ...latest.current, done: outcome.comment.status === "submitted" };
      setStatus({ state: "saved" });
    } else {
      setStatus({ state: "failed", message: outcome.message });
    }
  }

  function change(next: string) {
    // Changing a comment that was done makes it a draft again (D34).
    latest.current = { text: next, done: false };
    setText(next);
    setDone(false);
    setStatus({ state: "idle" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  function toggleDone(next: boolean) {
    latest.current = { ...latest.current, done: next };
    setDone(next);
    void flush();
  }

  function pick(entry: BankEntry) {
    change(entry.text);
    setShowSuggestions(false);
    textRef.current?.focus();
  }

  async function addToBank() {
    if (!saveToBank) return;
    const result = await saveToBank(text);
    setBankNote(result.message);
  }

  const statusText =
    status.state === "saving"
      ? "Saving…"
      : status.state === "failed"
        ? `Not saved. ${status.message}`
        : status.state === "saved"
          ? done
            ? "Saved and marked done"
            : "Saved as a draft"
          : done
            ? "Done"
            : hasSaved
              ? "Draft"
              : "";

  return (
    <div className="flex min-w-60 flex-col gap-2">
      <textarea
        ref={textRef}
        id={`${id}-text`}
        aria-label={label}
        aria-describedby={`${id}-count ${id}-status`}
        aria-invalid={!check.ok || undefined}
        readOnly={readOnly}
        rows={2}
        value={text}
        onChange={(e) => change(e.target.value)}
        onBlur={() => void flush()}
        className={cn(
          "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-20 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-3 md:text-sm",
          readOnly && "bg-muted/50 text-muted-foreground cursor-not-allowed",
          !check.ok && text.length > 0 && "border-destructive ring-destructive/20 ring-3",
        )}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span
          id={`${id}-count`}
          className={cn(
            "text-muted-foreground",
            text.replace(/\s+/g, " ").trim().length > max && "text-destructive font-medium",
          )}
        >
          {charactersLeft(text, max)}
        </span>
        <span
          id={`${id}-status`}
          role="status"
          className={cn(
            status.state === "failed"
              ? "text-destructive font-medium"
              : done
                ? "font-medium text-emerald-700 dark:text-emerald-300"
                : "text-muted-foreground",
          )}
        >
          {statusText}
        </span>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <label className="bg-card flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5"
              checked={done}
              onChange={(e) => toggleDone(e.target.checked)}
            />
            Done<span className="sr-only"> with {label}</span>
          </label>
          <button
            type="button"
            aria-expanded={showSuggestions}
            aria-controls={`${id}-suggestions`}
            onClick={() => setShowSuggestions((v) => !v)}
            className="bg-card min-h-11 rounded-lg border px-3 text-sm font-medium"
          >
            Suggestions ({suggestions.length})<span className="sr-only"> for {label}</span>
          </button>
          {saveToBank && (
            <button
              type="button"
              disabled={!check.ok || text.trim() === ""}
              onClick={() => void addToBank()}
              className="bg-card min-h-11 rounded-lg border px-3 text-sm font-medium disabled:opacity-50"
            >
              Save to my bank<span className="sr-only"> from {label}</span>
            </button>
          )}
        </div>
      )}
      {bankNote && <p className="text-muted-foreground text-xs">{bankNote}</p>}
      {!readOnly && showSuggestions && (
        <div id={`${id}-suggestions`} className="bg-muted/40 rounded-xl border p-2">
          {suggestions.length === 0 ? (
            <p className="text-muted-foreground p-2 text-sm">
              {grade
                ? `No saved comments for grade ${grade} yet. Add some in your comment bank.`
                : "No saved comments for any grade yet. Add some in your comment bank."}
            </p>
          ) : (
            <ul aria-label={`Suggestions for ${label}`} className="flex flex-col gap-1">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="hover:bg-background min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm"
                  >
                    {s.text}
                    {(s.grade || !s.isMine) && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {[s.grade && `grade ${s.grade}`, !s.isMine && "shared"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
