"use server";

import { revalidatePath } from "next/cache";
import {
  CLASS_COMMENT_MAX,
  SUBJECT_COMMENT_MAX,
  checkComment,
  parseBankEntry,
  termHasClassComments,
} from "@/lib/comments/rules";
import { isUuid } from "@/lib/setup/structure";
import { createClient } from "@/lib/supabase/server";
import { failed, saved, type FormState } from "../platform/form-state";
import { mayWriteSubjectComments, type SavedComment } from "./comment-data";
import { isStillInClass, marksActor } from "./data";

/**
 * Comment actions (US-5.1 to US-5.3; D34). Each checks who may write here
 * and validates with src/lib/comments; writes go through the user-scoped
 * client, so the comments' RLS, the deadline lock and the audit trigger
 * apply as well.
 */

const TRY_AGAIN = "Could not save. Check your connection and try again.";
const LOCKED = "Comments are locked. Ask the school admin to write or unlock them.";

function dbMessage(error: { code?: string; message: string }, notAllowed: string): string {
  if (error.code === "42501") return error.message.includes("locked") ? LOCKED : notAllowed;
  if (error.code === "23514" || error.code === "P0001") {
    const m = error.message;
    return m.charAt(0).toUpperCase() + m.slice(1) + (m.endsWith(".") ? "" : ".");
  }
  return TRY_AGAIN;
}

export type SaveCommentResult =
  { ok: true; comment: SavedComment } | { ok: false; message: string };

type CommentInput = { termId: string; enrolmentId: string; text: string; done: boolean };

function validInput(input: CommentInput): boolean {
  return (
    isUuid(input.termId) &&
    isUuid(input.enrolmentId) &&
    typeof input.text === "string" &&
    typeof input.done === "boolean"
  );
}

/**
 * Saves one learner's subject comment (US-5.1). Typing saves a draft;
 * marking it done saves it as submitted, which signs it (signed_at). A
 * change to a comment that was done puts it back to draft.
 */
export async function saveSubjectComment(
  input: CommentInput & { classSubjectId: string },
): Promise<SaveCommentResult> {
  const notAllowed = "Only the subject's teacher or the school admin can write this comment.";
  const actor = await marksActor();
  if (!actor || !validInput(input) || !isUuid(input.classSubjectId))
    return { ok: false, message: actor ? TRY_AGAIN : notAllowed };
  const checked = checkComment(input.text, SUBJECT_COMMENT_MAX, input.done);
  if (!checked.ok) return { ok: false, message: checked.message };

  const supabase = await createClient();
  const [{ data: cs }, { data: takes }, { data: enrolment }] = await Promise.all([
    supabase
      .from("class_subjects")
      .select("id, teacher_id")
      .eq("id", input.classSubjectId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    supabase
      .from("enrolment_subjects")
      .select("id")
      .eq("enrolment_id", input.enrolmentId)
      .eq("class_subject_id", input.classSubjectId)
      .maybeSingle(),
    supabase.from("enrolments").select("status").eq("id", input.enrolmentId).maybeSingle(),
  ]);
  if (!cs || !mayWriteSubjectComments(actor, cs.teacher_id))
    return { ok: false, message: notAllowed };
  if (!takes || !enrolment)
    return { ok: false, message: "This learner does not take the subject." };
  if (!isStillInClass(enrolment.status))
    return { ok: false, message: "This learner has left the class." };

  const { data, error } = await supabase
    .from("subject_comments")
    .upsert(
      {
        school_id: actor.schoolId,
        term_id: input.termId,
        enrolment_id: input.enrolmentId,
        class_subject_id: cs.id,
        comment: checked.text,
        status: input.done ? "submitted" : "draft",
      },
      { onConflict: "term_id,enrolment_id,class_subject_id" },
    )
    .select("comment, status, signed_at")
    .single();
  if (error) return { ok: false, message: dbMessage(error, notAllowed) };
  return {
    ok: true,
    comment: { text: data.comment, status: data.status, signedAt: data.signed_at },
  };
}

/**
 * Saves one learner's class teacher comment (US-5.3): the class teacher
 * or the school admin, term reports only (Q8).
 */
export async function saveClassComment(
  input: CommentInput & { classId: string },
): Promise<SaveCommentResult> {
  const notAllowed = "Only the class teacher or the school admin can write this comment.";
  const actor = await marksActor();
  if (!actor || !validInput(input) || !isUuid(input.classId))
    return { ok: false, message: actor ? TRY_AGAIN : notAllowed };
  const checked = checkComment(input.text, CLASS_COMMENT_MAX, input.done);
  if (!checked.ok) return { ok: false, message: checked.message };

  const supabase = await createClient();
  const [{ data: klass }, { data: enrolment }, { data: term }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, class_teacher_id")
      .eq("id", input.classId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    supabase
      .from("enrolments")
      .select("status, class_id")
      .eq("id", input.enrolmentId)
      .maybeSingle(),
    supabase
      .from("terms")
      .select("kind")
      .eq("id", input.termId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
  ]);
  const teaches = actor.roles.includes("teacher") || actor.roles.includes("hod");
  const allowed =
    actor.roles.includes("school_admin") ||
    (teaches && !!klass && klass.class_teacher_id === actor.userId);
  if (!klass || !allowed) return { ok: false, message: notAllowed };
  if (!enrolment || enrolment.class_id !== klass.id || !term)
    return { ok: false, message: "This learner is not in the class." };
  if (!isStillInClass(enrolment.status))
    return { ok: false, message: "This learner has left the class." };
  if (!termHasClassComments(term.kind))
    return { ok: false, message: "Class comments are for term reports, not vacation reports." };

  const { data, error } = await supabase
    .from("class_comments")
    .upsert(
      {
        school_id: actor.schoolId,
        term_id: input.termId,
        enrolment_id: input.enrolmentId,
        comment: checked.text,
        status: input.done ? "submitted" : "draft",
      },
      { onConflict: "term_id,enrolment_id" },
    )
    .select("comment, status")
    .single();
  if (error) return { ok: false, message: dbMessage(error, notAllowed) };
  return { ok: true, comment: { text: data.comment, status: data.status, signedAt: null } };
}

// Comment bank (US-5.2) -----------------------------------------------------------------

function revalidateBank() {
  revalidatePath("/teaching/comment-bank");
}

/** Adds an entry to the viewer's bank from the bank page's form. */
export async function addBankEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await marksActor();
  if (!actor) return failed("Only staff can save comments.");
  const parsed = parseBankEntry({
    text: formData.get("text"),
    grade: formData.get("grade"),
    subjectId: formData.get("subjectId"),
    shared: formData.get("shared"),
  });
  if (!parsed.ok) return failed("Check the comment.", parsed.errors);
  if (parsed.value.subjectId && !isUuid(parsed.value.subjectId))
    return failed("Check the comment.", { subjectId: "Choose a subject from the list." });

  const supabase = await createClient();
  const { error } = await supabase.from("comment_bank").insert({
    school_id: actor.schoolId,
    owner_id: actor.userId,
    text: parsed.value.text,
    grade: parsed.value.grade,
    subject_id: parsed.value.subjectId,
    is_shared: parsed.value.shared,
  });
  if (error) return failed(TRY_AGAIN);
  revalidateBank();
  return saved("Saved to your comment bank.");
}

/** Saves a comment typed in a comment box to the bank, for its subject and grade. */
export async function saveToBank(input: {
  text: string;
  subjectId: string | null;
  grade: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const actor = await marksActor();
  if (!actor) return { ok: false, message: "Only staff can save comments." };
  const parsed = parseBankEntry({
    text: input.text,
    grade: input.grade ?? "",
    subjectId: input.subjectId ?? "",
    shared: false,
  });
  if (!parsed.ok) return { ok: false, message: parsed.errors.text ?? "Check the comment." };
  if (parsed.value.subjectId && !isUuid(parsed.value.subjectId))
    return { ok: false, message: TRY_AGAIN };

  const supabase = await createClient();
  const { error } = await supabase.from("comment_bank").insert({
    school_id: actor.schoolId,
    owner_id: actor.userId,
    text: parsed.value.text,
    grade: parsed.value.grade,
    subject_id: parsed.value.subjectId,
  });
  if (error) return { ok: false, message: TRY_AGAIN };
  revalidateBank();
  return { ok: true, message: "Saved to your bank." };
}

/** Shares one of the viewer's entries with the school, or stops sharing it. */
export async function setBankEntryShared(id: string, shared: boolean): Promise<FormState> {
  const actor = await marksActor();
  if (!actor || !isUuid(id)) return failed("Only the comment's owner can change it.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comment_bank")
    .update({ is_shared: shared })
    .eq("id", id)
    .eq("owner_id", actor.userId)
    .select("id");
  if (error || !data?.length) return failed("Only the comment's owner can change it.");
  revalidateBank();
  return saved(shared ? "Shared with the school." : "Now private to you.");
}

/** Removes one of the viewer's entries (bank entries are not about a learner). */
export async function deleteBankEntry(id: string): Promise<FormState> {
  const actor = await marksActor();
  if (!actor || !isUuid(id)) return failed("Only the comment's owner can remove it.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comment_bank")
    .delete()
    .eq("id", id)
    .eq("owner_id", actor.userId)
    .select("id");
  if (error || !data?.length) return failed("Only the comment's owner can remove it.");
  revalidateBank();
  return saved("Removed.");
}
