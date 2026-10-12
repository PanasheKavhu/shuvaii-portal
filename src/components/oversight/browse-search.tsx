"use client";

import Link from "next/link";
import { useActionState } from "react";
import { searchSchool, type SearchState } from "@/app/(app)/admin/browse/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hitCount, hrefForHit, rolesText, type SearchHit } from "@/lib/oversight/summary";

const idle: SearchState = { status: "idle" };

/**
 * One box that finds learners (name or number), staff and classes (US-9.2).
 * The form posts to a server action, so the search never appears in the
 * address bar or access logs (D37), and it works before scripts load.
 */
export function BrowseSearch({ wholeSchool }: { wholeSchool: boolean }) {
  const [state, action, pending] = useActionState(searchSchool, idle);
  const query = state.status === "idle" ? "" : state.query;

  return (
    <section aria-label="Search the school" className="flex flex-col gap-3">
      <form action={action} role="search" className="flex flex-col gap-2">
        <label htmlFor="browse-q" className="font-semibold">
          Find a learner, staff member or class
        </label>
        <div className="flex gap-2">
          <Input
            key={query}
            id="browse-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={100}
            autoComplete="off"
            placeholder={
              wholeSchool ? "Name, learner number or class" : "A learner or class you teach"
            }
            className="h-11 min-w-0 flex-1"
          />
          <Button type="submit" className="h-11" disabled={pending}>
            {pending ? "Searching…" : "Search"}
          </Button>
        </div>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          {hitCount(state.results) === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing found for &ldquo;{state.query}&rdquo;.
            </p>
          ) : (
            <>
              <Hits title="Learners" hits={state.results.learners} />
              <Hits title="Staff" hits={state.results.staff} />
              <Hits title="Classes" hits={state.results.classes} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Hits({ title, hits }: { title: string; hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <div>
      <h3 className="text-muted-foreground text-sm font-medium">{title}</h3>
      <ul aria-label={title} className="bg-card mt-1 divide-y rounded-2xl border">
        {hits.map((h) => (
          <li key={h.id}>
            <Link
              href={hrefForHit(h)}
              prefetch={false}
              className="hover:bg-muted/40 flex min-h-12 flex-col justify-center px-4 py-2"
            >
              <span className="font-medium">{h.label}</span>
              <span className="text-muted-foreground text-sm break-words">
                {h.kind === "staff"
                  ? [rolesText(h.roles), h.detail].filter(Boolean).join(" · ")
                  : h.detail}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
