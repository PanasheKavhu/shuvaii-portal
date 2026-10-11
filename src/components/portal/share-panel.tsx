"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/platform/form-bits";
import { Button, buttonVariants } from "@/components/ui/button";
import { idle } from "@/app/(app)/platform/form-state";
import { createShareLink, revokeShareLink, type ShareState } from "@/app/(app)/share-actions";
import { shortDate, whatsAppShareUrl } from "@/lib/reports/portal";

/**
 * US-7.3 (D47): "Share" makes a link that opens the PDF with no sign in for
 * 7 days. The link is shown once (only its hash is kept), with a WhatsApp
 * button that fills in the message and a Copy button.
 */
export function ShareLinkMaker({
  reportId,
  term,
  school,
}: {
  reportId: string;
  term: string;
  school: string;
}) {
  const [state, action, pending] = useActionState<ShareState>(
    createShareLink.bind(null, reportId),
    idle,
  );
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      // No clipboard (an older phone or an insecure page): select the text to copy by hand.
      const field = document.getElementById("share-link") as HTMLInputElement | null;
      field?.select();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <Button
          type="submit"
          disabled={pending}
          className="h-12 w-full text-base sm:w-auto sm:px-6"
        >
          {pending ? "Making a link…" : state.link ? "Make another link" : "Share"}
        </Button>
      </form>
      <FormMessage status={state.status} message={state.message} />
      {state.link && (
        <div className="flex flex-col gap-2">
          <label htmlFor="share-link" className="text-sm font-medium">
            Share link
          </label>
          <input
            id="share-link"
            readOnly
            value={state.link}
            onFocus={(e) => e.currentTarget.select()}
            className="border-input bg-muted/40 h-12 w-full min-w-0 rounded-lg border px-3 font-mono text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <a
              href={whatsAppShareUrl(state.link, { term, school })}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({
                className: "h-12 bg-[#1d7d4f] text-base text-white hover:bg-[#176840]",
              })}
            >
              WhatsApp
            </a>
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              onClick={() => copy(state.link!)}
            >
              {copied === state.link ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            This link is shown only now. You can revoke it below at any time.
          </p>
        </div>
      )}
    </div>
  );
}

/** One of the owner's live links, with Revoke. */
export function ShareLinkRow({
  reportId,
  shareId,
  createdAt,
  expiresAt,
  opens,
}: {
  reportId: string;
  shareId: string;
  createdAt: string;
  expiresAt: string;
  opens: number;
}) {
  const [state, action, pending] = useActionState(
    revokeShareLink.bind(null, reportId, shareId),
    idle,
  );
  const label = `Link made ${shortDate(createdAt)}`;
  return (
    <li aria-label={label} className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0 text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-muted-foreground">
          Expires {shortDate(expiresAt)} · opened {opens} {opens === 1 ? "time" : "times"}
        </p>
        {state.status === "error" && (
          <p role="alert" className="text-destructive font-medium">
            {state.message}
          </p>
        )}
      </div>
      <form action={action} className="shrink-0">
        <Button type="submit" variant="outline" disabled={pending} className="h-11 px-4">
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </form>
    </li>
  );
}
