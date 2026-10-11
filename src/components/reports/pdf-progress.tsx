"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { makeReportPdfs } from "@/app/(app)/marks/report-actions";
import { pdfProgressLine } from "@/lib/reports/pdf-progress";

type Phase = "working" | "done" | "stuck";

/**
 * US-6.3, US-6.4 (D45): makes the class's report PDFs a few at a time
 * after publishing, with progress, starting by itself whenever published
 * reports are still without a PDF. Reports that fail are skipped for the
 * rest of the run and listed; "Try again" makes them again from their
 * snapshots.
 */
export function PdfProgress({
  classId,
  termId,
  total: initialTotal,
  ready: initialReady,
}: {
  classId: string;
  termId: string;
  total: number;
  ready: number;
}) {
  const router = useRouter();
  const [total, setTotal] = useState(initialTotal);
  const [ready, setReady] = useState(initialReady);
  const [failed, setFailed] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>(initialReady < initialTotal ? "working" : "done");
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setPhase("working");
    setError(null);
    const skip: string[] = [];
    try {
      for (;;) {
        const result = await makeReportPdfs(classId, termId, skip);
        if ("error" in result) {
          setError(result.error);
          setPhase("stuck");
          return;
        }
        skip.push(...result.failed);
        setTotal(result.total);
        setReady(result.ready);
        setFailed([...skip]);
        if (result.made.length === 0 && result.failed.length === 0) {
          setPhase(skip.length ? "stuck" : "done");
          router.refresh();
          return;
        }
      }
    } catch {
      setError("Could not make the PDFs. Check your connection and try again.");
      setPhase("stuck");
    } finally {
      running.current = false;
    }
  }, [classId, termId, router]);

  // Once, when the page opens with PDFs still to make.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || initialReady >= initialTotal) return;
    started.current = true;
    void run();
  }, [initialReady, initialTotal, run]);

  if (total === 0) return null;
  const percent = Math.round((ready / total) * 100);
  return (
    <section
      aria-labelledby="report-pdfs"
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-xs"
    >
      <h2 id="report-pdfs" className="text-lg font-semibold">
        Report PDFs
      </h2>
      <progress
        aria-label="Report PDFs made"
        value={ready}
        max={total}
        className="accent-primary h-3 w-full"
      >
        {percent}%
      </progress>
      <p role="status" aria-live="polite" className="text-sm">
        {pdfProgressLine({ ready, total, failed: failed.length, working: phase === "working" })}
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      {phase === "stuck" && (
        <Button type="button" onClick={() => void run()} className="h-11 w-fit px-4">
          Try again
        </Button>
      )}
    </section>
  );
}
