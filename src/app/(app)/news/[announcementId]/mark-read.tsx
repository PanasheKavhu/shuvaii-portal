"use client";

import { useEffect } from "react";
import { markNewsRead } from "../actions";

/**
 * Marks the open announcement read once it is on screen (D50). Done from
 * the browser rather than while the page renders, so a prefetch or a link
 * preview never counts as reading it.
 */
export function MarkRead({ announcementId }: { announcementId: string }) {
  useEffect(() => {
    void markNewsRead(announcementId);
  }, [announcementId]);
  return null;
}
