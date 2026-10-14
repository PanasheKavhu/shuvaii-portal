import { timingSafeEqual } from "node:crypto";

/**
 * The daily retention clean-ups (docs/RETENTION.md, D58): sign-in attempts
 * older than 30 days are deleted, and so are `imports` bucket files older
 * than 30 days. The files go through the Storage API (Storage refuses SQL
 * deletes), then forget_import_files() clears each job's path. Nothing else
 * is deleted.
 *
 * Written against a small interface so it can be unit tested without a
 * database; the route passes the service-role client.
 */

export const IMPORTS_BUCKET = "imports";
/** Files listed per round, and rounds per run: at most 5,000 files a day. */
export const FILES_PER_ROUND = 500;
export const MAX_ROUNDS = 10;
/** Storage's remove() takes a list; keep each call small. */
const REMOVE_BATCH = 100;

type RpcResult<T> = { data: T | null; error: { message: string } | null };

export type RetentionClient = {
  rpc(fn: "prune_sign_in_attempts"): PromiseLike<RpcResult<number>>;
  rpc(
    fn: "expired_import_files",
    args: { p_limit: number },
  ): PromiseLike<RpcResult<{ name: string }[]>>;
  rpc(fn: "forget_import_files", args: { p_names: string[] }): PromiseLike<RpcResult<number>>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
};

/** Counts only: safe to return from the route and to log (rule 5). */
export type RetentionResult = {
  signInAttemptsDeleted: number;
  importFilesDeleted: number;
  importJobsCleared: number;
};

export async function runRetention(client: RetentionClient): Promise<RetentionResult> {
  const pruned = await client.rpc("prune_sign_in_attempts");
  if (pruned.error) throw new Error("prune_sign_in_attempts failed");

  let importFilesDeleted = 0;
  let importJobsCleared = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const listed = await client.rpc("expired_import_files", { p_limit: FILES_PER_ROUND });
    if (listed.error) throw new Error("expired_import_files failed");
    const names = (listed.data ?? []).map((row) => row.name);
    if (names.length === 0) break;

    for (let i = 0; i < names.length; i += REMOVE_BATCH) {
      const batch = names.slice(i, i + REMOVE_BATCH);
      const removed = await client.storage.from(IMPORTS_BUCKET).remove(batch);
      if (removed.error) throw new Error("Removing import files failed");
      importFilesDeleted += batch.length;
    }
    const forgotten = await client.rpc("forget_import_files", { p_names: names });
    if (forgotten.error) throw new Error("forget_import_files failed");
    importJobsCleared += forgotten.data ?? 0;

    if (names.length < FILES_PER_ROUND) break;
  }

  return { signInAttemptsDeleted: pruned.data ?? 0, importFilesDeleted, importJobsCleared };
}

/**
 * The scheduler proves itself with `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends exactly this when CRON_SECRET is set). No secret set,
 * or one under 32 characters, means the route answers to nobody.
 */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
