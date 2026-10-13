#!/usr/bin/env node
// Copies Storage buckets to and from a folder, for the weekly external
// backup and the restore test (docs/BACKUPS.md, D60).
//
//   node scripts/backup/storage.mjs download <dir> [bucket ...]   (default: reports)
//   node scripts/backup/storage.mjs upload <dir>
//   node scripts/backup/storage.mjs verify <dir>
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of the project to read
// or write (STORAGE_URL overrides `${SUPABASE_URL}/storage/v1`). download
// writes <dir>/<bucket>/<path> and <dir>/manifest.json (name, size, type and
// SHA-256 of every file); upload puts every file back (overwriting);
// verify checks every file is in the target and that a sample (VERIFY_SAMPLE,
// default 25) matches its checksum. Prints counts only, never file names
// (they contain school ids only, but the rule is no personal data in logs).

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [command, dir, ...bucketArgs] = process.argv.slice(2);
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base =
  process.env.STORAGE_URL ||
  (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1` : null);

if (!["download", "upload", "verify"].includes(command) || !dir || !key || !base) {
  console.error(
    "Usage: node scripts/backup/storage.mjs download|upload|verify <dir> [bucket ...]\n" +
      "Needs SUPABASE_URL (or STORAGE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(2);
}

const headers = { authorization: `Bearer ${key}`, apikey: key };
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`Storage answered ${res.status} for ${init.method ?? "GET"}`);
  return res;
}

/** Every file in a bucket, walking folders. */
async function listAll(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await call(`${base}/object/list/${bucket}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });
    const entries = await res.json();
    for (const entry of entries) {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...(await listAll(bucket, name)));
      else
        files.push({
          name,
          size: entry.metadata?.size ?? null,
          type: entry.metadata?.mimetype ?? null,
        });
    }
    if (entries.length < 1000) return files;
  }
}

async function download() {
  const buckets = bucketArgs.length ? bucketArgs : ["reports"];
  const manifest = { createdAt: new Date().toISOString(), buckets: {} };
  for (const bucket of buckets) {
    const files = await listAll(bucket);
    manifest.buckets[bucket] = [];
    for (const file of files) {
      const res = await call(`${base}/object/authenticated/${bucket}/${encodePath(file.name)}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const target = path.join(dir, bucket, file.name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      manifest.buckets[bucket].push({
        name: file.name,
        size: bytes.length,
        type: file.type ?? res.headers.get("content-type") ?? "application/octet-stream",
        sha256: sha256(bytes),
      });
    }
    console.log(`${bucket}: ${files.length} files`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

async function readManifest() {
  return JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
}

async function upload() {
  const manifest = await readManifest();
  for (const [bucket, files] of Object.entries(manifest.buckets)) {
    for (const file of files) {
      const bytes = await readFile(path.join(dir, bucket, file.name));
      await call(`${base}/object/${bucket}/${encodePath(file.name)}`, {
        method: "POST",
        headers: { "content-type": file.type, "x-upsert": "true" },
        body: bytes,
      });
    }
    console.log(`${bucket}: ${files.length} files uploaded`);
  }
}

async function verify() {
  const manifest = await readManifest();
  const sample = Number(process.env.VERIFY_SAMPLE ?? 25);
  let problems = 0;
  for (const [bucket, files] of Object.entries(manifest.buckets)) {
    const present = new Set((await listAll(bucket)).map((f) => f.name));
    const missing = files.filter((f) => !present.has(f.name)).length;
    let checked = 0;
    let mismatched = 0;
    for (const file of files.slice(0, sample)) {
      if (!present.has(file.name)) continue;
      const res = await call(`${base}/object/authenticated/${bucket}/${encodePath(file.name)}`);
      if (sha256(Buffer.from(await res.arrayBuffer())) !== file.sha256) mismatched++;
      checked++;
    }
    console.log(
      `${bucket}: ${files.length} expected, ${files.length - missing} present, ${missing} missing; ` +
        `${checked} checksums checked, ${mismatched} different`,
    );
    problems += missing + mismatched;
  }
  if (problems) process.exit(1);
}

await { download, upload, verify }[command]();
