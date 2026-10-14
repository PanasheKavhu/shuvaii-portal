import { describe, expect, it } from "vitest";
import {
  FILES_PER_ROUND,
  isAuthorizedCron,
  runRetention,
  type RetentionClient,
} from "@/lib/ops/retention";

/** A fake service-role client: `files` are the expired imports, removed as asked. */
function fakeClient(files: string[], fail?: string) {
  const calls: string[] = [];
  const removed: string[] = [];
  let left = [...files];
  const client = {
    rpc(fn: string, args?: { p_limit?: number; p_names?: string[] }) {
      calls.push(fn);
      if (fn === fail) return Promise.resolve({ data: null, error: { message: "boom" } });
      if (fn === "prune_sign_in_attempts") return Promise.resolve({ data: 7, error: null });
      if (fn === "expired_import_files") {
        return Promise.resolve({
          data: left.slice(0, args!.p_limit).map((name) => ({ name })),
          error: null,
        });
      }
      return Promise.resolve({ data: args!.p_names!.length, error: null });
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            calls.push(`remove:${bucket}:${paths.length}`);
            if (fail === "remove") {
              return Promise.resolve({ data: null, error: { message: "boom" } });
            }
            removed.push(...paths);
            left = left.filter((name) => !paths.includes(name));
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    },
  } as unknown as RetentionClient;
  return { client, calls, removed };
}

describe("runRetention", () => {
  it("prunes sign-in attempts and removes expired import files from the imports bucket", async () => {
    const { client, calls, removed } = fakeClient(["a/1.xlsx", "a/2.xlsx"]);
    expect(await runRetention(client)).toEqual({
      signInAttemptsDeleted: 7,
      importFilesDeleted: 2,
      importJobsCleared: 2,
    });
    expect(removed).toEqual(["a/1.xlsx", "a/2.xlsx"]);
    expect(calls).toEqual([
      "prune_sign_in_attempts",
      "expired_import_files",
      "remove:imports:2",
      "forget_import_files",
    ]);
  });

  it("works through a backlog in rounds and removes in batches of 100", async () => {
    const files = Array.from({ length: FILES_PER_ROUND + 150 }, (_, i) => `a/${i}.xlsx`);
    const { client, calls, removed } = fakeClient(files);
    const result = await runRetention(client);
    expect(result.importFilesDeleted).toBe(files.length);
    expect(removed).toHaveLength(files.length);
    expect(calls.filter((c) => c === "expired_import_files")).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("remove:")).every((c) => !c.endsWith(":0"))).toBe(true);
  });

  it("does nothing to files when none have expired", async () => {
    const { client, calls } = fakeClient([]);
    expect((await runRetention(client)).importFilesDeleted).toBe(0);
    expect(calls).toEqual(["prune_sign_in_attempts", "expired_import_files"]);
  });

  it("stops before clearing job paths when Storage refuses the delete", async () => {
    const { client, calls } = fakeClient(["a/1.xlsx"], "remove");
    await expect(runRetention(client)).rejects.toThrow("Removing import files failed");
    expect(calls).not.toContain("forget_import_files");
  });

  it("fails with the step's name only", async () => {
    const { client } = fakeClient([], "prune_sign_in_attempts");
    await expect(runRetention(client)).rejects.toThrow("prune_sign_in_attempts failed");
  });
});

describe("isAuthorizedCron", () => {
  const secret = "s".repeat(40);

  it("accepts the scheduler's bearer secret", () => {
    expect(isAuthorizedCron(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("refuses a wrong, missing or short secret", () => {
    expect(isAuthorizedCron(`Bearer ${"t".repeat(40)}`, secret)).toBe(false);
    expect(isAuthorizedCron(null, secret)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${secret}`, undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer short", "short")).toBe(false);
  });
});
