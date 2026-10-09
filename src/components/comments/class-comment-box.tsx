"use client";

import { saveClassComment, saveToBank } from "@/app/(app)/marks/comment-actions";
import type { SavedComment } from "@/app/(app)/marks/comment-data";
import { CLASS_COMMENT_MAX, type BankEntry } from "@/lib/comments/rules";
import { CommentBox } from "./comment-box";

/** The class teacher's overall comment for one learner (US-5.3). */
export function ClassCommentBox({
  classId,
  termId,
  enrolmentId,
  learnerName,
  initial,
  readOnly,
  bank,
  grade,
}: {
  classId: string;
  termId: string;
  enrolmentId: string;
  learnerName: string;
  initial: SavedComment | undefined;
  readOnly: boolean;
  bank: readonly BankEntry[];
  grade: string | null;
}) {
  return (
    <CommentBox
      label={`Class teacher's comment for ${learnerName}`}
      initial={initial}
      max={CLASS_COMMENT_MAX}
      readOnly={readOnly}
      bank={bank}
      subjectId={null}
      grade={grade}
      save={(text, done) => saveClassComment({ classId, termId, enrolmentId, text, done })}
      saveToBank={(text) => saveToBank({ text, subjectId: null, grade })}
    />
  );
}
