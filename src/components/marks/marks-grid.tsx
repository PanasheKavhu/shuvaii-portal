"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { saveMark } from "@/app/(app)/marks/actions";
import { saveSubjectComment, saveToBank } from "@/app/(app)/marks/comment-actions";
import type { SavedComment } from "@/app/(app)/marks/comment-data";
import type { GridLearner, SavedMark, SavedResult } from "@/app/(app)/marks/data";
import { CommentBox } from "@/components/comments/comment-box";
import type { BankEntry } from "@/lib/comments/rules";
import { subjectResult, type SubjectResult } from "@/lib/grading/results";
import { cellMark, cellText, describeIncomplete, parseCell } from "@/lib/marks/cell";
import { arrowLeavesInput, moveFrom, type NavKey } from "@/lib/marks/grid-nav";
import type { Band } from "@/lib/setup/bands";
import { cn } from "@/lib/utils";

export type GridAssessment = {
  id: string;
  name: string;
  maxMark: string;
  weightPercent: string;
  /** False when the viewer may not change this assessment's marks (locked). */
  writable: boolean;
};

/** The subject comment column beside the marks (US-5.1, US-5.2; D34). */
export type GridComments = {
  label: string;
  max: number;
  /** The viewer may not write these comments (head, or locked for the teacher). */
  readOnly: boolean;
  saved: Record<string, SavedComment>;
  bank: readonly BankEntry[];
  subjectId: string;
  classSubjectId: string;
  termId: string;
};

type CellState =
  | { state: "saving" }
  | { state: "saved" }
  | { state: "failed"; message: string }
  | { state: "invalid"; message: string };

const SAVE_DELAY_MS = 600;
const key = (assessmentId: string, enrolmentId: string) => `${assessmentId}:${enrolmentId}`;

/**
 * The marks grid (US-4.2, US-4.4): learners by assessment. Each cell
 * autosaves shortly after typing stops (and at once on Enter or leaving
 * the cell) and shows saving, saved or not saved. A mark above the maximum
 * or below 0 is refused in the cell and never sent. "A" marks absent and
 * "E" excused. Arrow keys and Enter move between cells. Each row shows the
 * live result from src/lib/grading as marks are typed, and the result
 * saved in the database (public.subject_results()) once saved.
 *
 * Below 768px one assessment is shown at a time, with large inputs and
 * Absent and Excused buttons. With `comments`, a subject comment column
 * follows the result (on a phone, as one more choice beside the
 * assessments); its bank suggestions follow each row's live grade.
 */
export function MarksGrid({
  assessments,
  learners,
  marks,
  bands,
  saved,
  readOnly,
  comments,
}: {
  assessments: readonly GridAssessment[];
  learners: readonly GridLearner[];
  marks: Record<string, SavedMark>;
  bands: readonly Band[];
  saved: Record<string, SavedResult>;
  /** The whole grid is read-only (locked for this teacher). */
  readOnly: boolean;
  comments?: GridComments;
}) {
  const [texts, setTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [k, mark] of Object.entries(marks)) initial[k] = cellText(mark);
    return initial;
  });
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [results, setResults] = useState(saved);
  const [col, setCol] = useState(0);

  const gridRef = useRef<HTMLTableElement>(null);
  const latest = useRef(texts);
  const savedTexts = useRef(new Map(Object.entries(texts)));
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => clearTimeout(t));
  }, []);

  function setCell(k: string, state: CellState | null) {
    setCells((prev) => {
      const next = { ...prev };
      if (state) next[k] = state;
      else delete next[k];
      return next;
    });
  }

  async function flush(assessment: GridAssessment, enrolmentId: string) {
    const k = key(assessment.id, enrolmentId);
    clearTimeout(timers.current.get(k));
    timers.current.delete(k);
    const text = latest.current[k] ?? "";
    const value = parseCell(text, assessment.maxMark);
    if (value.kind === "invalid" || value.kind === "empty") return;
    if (text.trim() === (savedTexts.current.get(k) ?? "")) return;
    if (inFlight.current.has(k)) return; // the running save re-checks when it ends

    inFlight.current.add(k);
    setCell(k, { state: "saving" });
    let outcome: Awaited<ReturnType<typeof saveMark>>;
    try {
      outcome = await saveMark({ assessmentId: assessment.id, enrolmentId, value: text });
    } catch {
      outcome = { ok: false, message: "Could not save. Check your connection and try again." };
    }
    inFlight.current.delete(k);

    if (outcome.ok) {
      savedTexts.current.set(k, text.trim());
      if (outcome.saved) {
        const result = outcome.saved;
        setResults((prev) => ({ ...prev, [enrolmentId]: result }));
      }
    }
    const now = latest.current[k] ?? "";
    if (now.trim() !== text.trim()) {
      // Typed again while saving: save the newer value (or show why not).
      const again = parseCell(now, assessment.maxMark);
      if (again.kind === "invalid") setCell(k, { state: "invalid", message: again.message });
      else void flush(assessment, enrolmentId);
      return;
    }
    if (outcome.ok) {
      // Show the mark as saved: "a" becomes "A", "07.50" becomes "7.5".
      const shown = cellText(outcome.mark);
      savedTexts.current.set(k, shown);
      latest.current = { ...latest.current, [k]: shown };
      setTexts(latest.current);
    }
    setCell(k, outcome.ok ? { state: "saved" } : { state: "failed", message: outcome.message });
  }

  function change(assessment: GridAssessment, enrolmentId: string, text: string) {
    const k = key(assessment.id, enrolmentId);
    latest.current = { ...latest.current, [k]: text };
    setTexts(latest.current);
    clearTimeout(timers.current.get(k));

    const value = parseCell(text, assessment.maxMark);
    if (value.kind === "invalid") return setCell(k, { state: "invalid", message: value.message });
    if (value.kind === "empty") {
      return setCell(
        k,
        savedTexts.current.get(k)
          ? { state: "invalid", message: "A saved mark cannot be cleared. Type a mark, A or E." }
          : null,
      );
    }
    if (text.trim() === (savedTexts.current.get(k) ?? "")) return setCell(k, { state: "saved" });
    setCell(k, null);
    timers.current.set(
      k,
      setTimeout(() => void flush(assessment, enrolmentId), SAVE_DELAY_MS),
    );
  }

  function inputAt(row: number, c: number): HTMLInputElement | null {
    return (
      gridRef.current?.querySelector<HTMLInputElement>(
        `input[data-row="${row}"][data-col="${c}"]`,
      ) ?? null
    );
  }

  function onKeyDown(
    e: KeyboardEvent<HTMLInputElement>,
    row: number,
    c: number,
    assessment: GridAssessment,
    enrolmentId: string,
  ) {
    let navKey: NavKey | null = null;
    if (e.key === "Enter") {
      navKey = e.shiftKey ? "ShiftEnter" : "Enter";
      void flush(assessment, enrolmentId);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      navKey = e.key;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const input = e.currentTarget;
      if (arrowLeavesInput(e.key, input.value, input.selectionStart, input.selectionEnd))
        navKey = e.key;
    }
    if (!navKey) return;
    e.preventDefault();
    const to = moveFrom({ row, col: c }, navKey, learners.length, assessments.length, (cell) => {
      const input = inputAt(cell.row, cell.col);
      return !!input && !input.readOnly && input.offsetParent !== null;
    });
    if (to) inputAt(to.row, to.col)?.focus();
  }

  function liveResult(enrolmentId: string): SubjectResult | null {
    return subjectResult(
      assessments.map((a) => ({
        maxMark: a.maxMark,
        weightPercent: a.weightPercent,
        mark: cellMark(parseCell(texts[key(a.id, enrolmentId)] ?? "", a.maxMark)),
      })),
      bands,
    );
  }

  const current = assessments[col] ?? assessments[0];
  const commentCol = assessments.length;
  const columns = assessments.length + (comments ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {readOnly
          ? "These marks are read-only."
          : "Type a mark, A for absent or E for excused. Marks save as you type. Arrow keys and Enter move between cells."}
      </p>

      {columns > 1 && (
        <div role="group" aria-label="Assessment" className="flex flex-wrap gap-2 md:hidden">
          {assessments.map((a, i) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={i === col}
              onClick={() => setCol(i)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium",
                i === col ? "bg-primary text-primary-foreground border-transparent" : "bg-card",
              )}
            >
              {a.name} <span className="opacity-80">/{a.maxMark}</span>
            </button>
          ))}
          {comments && (
            <button
              type="button"
              aria-pressed={col === commentCol}
              onClick={() => setCol(commentCol)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium",
                col === commentCol
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card",
              )}
            >
              {comments.label}
            </button>
          )}
        </div>
      )}

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table ref={gridRef} aria-label="Marks" className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-sm">
              <th scope="col" className="bg-muted/60 rounded-tl-xl p-3 font-semibold">
                Learner
              </th>
              {assessments.map((a, i) => (
                <th
                  key={a.id}
                  scope="col"
                  className={cn(
                    "bg-muted/60 p-3 align-bottom font-semibold",
                    i === col ? "" : "hidden md:table-cell",
                  )}
                >
                  <span className="block">{a.name}</span>
                  <span className="text-muted-foreground block text-xs font-normal">
                    out of {a.maxMark} · {a.weightPercent}%{!a.writable && " · locked"}
                  </span>
                </th>
              ))}
              <th
                scope="col"
                className={cn(
                  "bg-muted/60 p-3 font-semibold",
                  comments ? "" : "rounded-tr-xl",
                  comments && col === commentCol && "hidden md:table-cell",
                )}
              >
                Result
              </th>
              {comments && (
                <th
                  scope="col"
                  className={cn(
                    "bg-muted/60 rounded-tr-xl p-3 align-bottom font-semibold",
                    col === commentCol ? "" : "hidden md:table-cell",
                  )}
                >
                  {comments.label}
                  <span className="text-muted-foreground block text-xs font-normal">
                    up to {comments.max} characters
                  </span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {learners.map((learner, row) => {
              const live = liveResult(learner.enrolmentId);
              const savedResult = results[learner.enrolmentId];
              return (
                <tr key={learner.enrolmentId} className="align-top">
                  <th scope="row" className="border-b p-3 text-left font-normal">
                    <span className="block font-medium">{learner.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {learner.learnerNumber}
                      {!learner.stillInClass && " · left the class"}
                    </span>
                  </th>
                  {assessments.map((a, c) => {
                    const k = key(a.id, learner.enrolmentId);
                    const cell = cells[k];
                    const locked = readOnly || !a.writable || !learner.stillInClass;
                    const bad = cell?.state === "invalid" || cell?.state === "failed";
                    return (
                      <td
                        key={a.id}
                        className={cn("border-b p-2", c === col ? "" : "hidden md:table-cell")}
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          enterKeyHint="next"
                          autoComplete="off"
                          data-row={row}
                          data-col={c}
                          aria-label={`${a.name} for ${learner.name}`}
                          aria-describedby={`m-${k}`}
                          aria-invalid={bad || undefined}
                          readOnly={locked}
                          value={texts[k] ?? ""}
                          onChange={(e) => change(a, learner.enrolmentId, e.target.value)}
                          onBlur={() => void flush(a, learner.enrolmentId)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => onKeyDown(e, row, c, a, learner.enrolmentId)}
                          className={cn(
                            "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-12 w-full min-w-16 rounded-lg border bg-transparent px-3 text-lg tabular-nums outline-none focus-visible:ring-3 md:h-10 md:w-24 md:text-base",
                            locked && "bg-muted/50 text-muted-foreground cursor-not-allowed",
                            bad && "border-destructive ring-destructive/20 ring-3",
                          )}
                        />
                        {!locked && (
                          <span className="mt-2 flex gap-2 md:hidden">
                            {(["A", "E"] as const).map((letter) => (
                              <button
                                key={letter}
                                type="button"
                                onClick={() => {
                                  change(a, learner.enrolmentId, letter);
                                  void flush(a, learner.enrolmentId);
                                }}
                                className="bg-card min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium"
                              >
                                {letter === "A" ? "Absent" : "Excused"}
                                <span className="sr-only"> for {learner.name}</span>
                              </button>
                            ))}
                          </span>
                        )}
                        <CellStatus id={`m-${k}`} cell={cell} />
                      </td>
                    );
                  })}
                  <td
                    className={cn(
                      "border-b p-3",
                      comments && col === commentCol && "hidden md:table-cell",
                    )}
                  >
                    <output aria-label={`Result for ${learner.name}`} className="flex flex-col">
                      <ResultText result={live} />
                      {savedResult && (
                        <span className="text-muted-foreground text-xs">
                          Saved:{" "}
                          {savedResult.status === "complete"
                            ? `${savedResult.roundedMark} ${savedResult.grade ?? ""}`.trim()
                            : describeIncomplete(savedResult.reason).toLowerCase()}
                        </span>
                      )}
                    </output>
                  </td>
                  {comments && (
                    <td
                      className={cn(
                        "border-b p-2",
                        col === commentCol ? "" : "hidden md:table-cell",
                      )}
                    >
                      <CommentBox
                        label={`${comments.label} for ${learner.name}`}
                        initial={comments.saved[learner.enrolmentId]}
                        max={comments.max}
                        readOnly={comments.readOnly || !learner.stillInClass}
                        bank={comments.bank}
                        subjectId={comments.subjectId}
                        grade={live?.status === "complete" ? live.grade : null}
                        save={(text, done) =>
                          saveSubjectComment({
                            classSubjectId: comments.classSubjectId,
                            termId: comments.termId,
                            enrolmentId: learner.enrolmentId,
                            text,
                            done,
                          })
                        }
                        saveToBank={(text) =>
                          saveToBank({
                            text,
                            subjectId: comments.subjectId,
                            grade: live?.status === "complete" ? live.grade : null,
                          })
                        }
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {current && learners.length === 0 && (
        <p className="text-muted-foreground">No learners take this subject yet.</p>
      )}
    </div>
  );
}

function CellStatus({ id, cell }: { id: string; cell: CellState | undefined }) {
  const text =
    cell?.state === "saving"
      ? "Saving…"
      : cell?.state === "saved"
        ? "Saved"
        : cell?.state === "failed"
          ? `Not saved. ${cell.message}`
          : cell?.state === "invalid"
            ? cell.message
            : "";
  return (
    <span
      id={id}
      className={cn(
        "mt-1 block min-h-4 text-xs",
        cell?.state === "failed" || cell?.state === "invalid"
          ? "text-destructive font-medium"
          : cell?.state === "saved"
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-muted-foreground",
      )}
    >
      {text}
    </span>
  );
}

function ResultText({ result }: { result: SubjectResult | null }) {
  if (!result) return <span className="text-muted-foreground">No assessments</span>;
  if (result.status === "incomplete")
    return (
      <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
        {describeIncomplete(result.reason)}
      </span>
    );
  return (
    <span className="text-base font-semibold tabular-nums">
      {result.roundedMark}
      {result.grade && <span className="text-primary ml-2">{result.grade}</span>}
    </span>
  );
}
