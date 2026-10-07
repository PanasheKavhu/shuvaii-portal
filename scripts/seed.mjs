#!/usr/bin/env node
// Seeds the local Supabase stack from seed/*.csv: creates an auth user for
// every row in profiles.csv (triggering public.handle_new_user), then loads
// schools, platform_admins and memberships. See seed/README.md for the load
// order and what is deliberately not seeded.
//
// Usage: npm run db:seed  (reads SUPABASE env vars from .env.local; see
// package.json, which passes --env-file to Node).
//
// Re-runnable: auth users and table rows are upserted, so running this again
// after `supabase db reset` or on top of an already-seeded database is safe.
//
// Local/demo only — never point this at a staging or production project.
// The fixed password below is a published demo credential, not a secret.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.join(here, "..", "seed");

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "sp-portal-demo-2026";

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. " +
      "Copy .env.example to .env.local and fill them in (npm run db:start prints them).",
  );
  process.exit(1);
}

// Admin client: service-role key, server-side only. This script is the one
// place outside src/lib/supabase/admin.ts allowed to read it, since it never
// runs in the Next.js app.
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/quotes. */
function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx]])));
}

function readCsv(name) {
  return parseCsv(readFileSync(path.join(seedDir, `${name}.csv`), "utf8"));
}

/** '' -> null, otherwise the string unchanged. */
function orNull(value) {
  return value === "" || value === undefined ? null : value;
}

async function seedAuthUsersAndProfiles() {
  const rows = readCsv("profiles");
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const { data: existing } = await admin.auth.admin.getUserById(row.id);

    if (!existing?.user) {
      const { error } = await admin.auth.admin.createUser({
        id: row.id,
        email: row.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: {
          full_name: orNull(row.full_name),
          phone: orNull(row.phone),
        },
      });
      if (error) throw new Error(`creating auth user ${row.id} failed: ${error.message}`);
      created++;
    }

    // The on_auth_user_created trigger already inserted a profiles row;
    // update it to match the CSV exactly (full_name, phone, created_at),
    // per seed/README.md step 3 ("update it rather than insert").
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        full_name: orNull(row.full_name),
        email: row.email,
        phone: orNull(row.phone),
        created_at: row.created_at,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(`updating profile ${row.id} failed: ${updateError.message}`);
    updated++;
  }

  console.log(`auth users + profiles: ${created} created, ${updated} upserted`);
}

async function seedSchools() {
  const rows = readCsv("schools").map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    motto: orNull(row.motto),
    stage: row.stage,
    address: orNull(row.address),
    phone: orNull(row.phone),
    email: orNull(row.email),
    logo_path: orNull(row.logo_path),
    stamp_path: orNull(row.stamp_path),
    head_signature_path: orNull(row.head_signature_path),
    primary_color: orNull(row.primary_color),
    accent_color: orNull(row.accent_color),
    report_footer_text: orNull(row.report_footer_text),
    timezone: row.timezone,
    feature_flags: JSON.parse(row.feature_flags || "{}"),
    status: row.status,
    created_at: row.created_at,
  }));

  const { error } = await admin.from("schools").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`seeding schools failed: ${error.message}`);
  console.log(`schools: ${rows.length} upserted`);
}

async function seedPlatformAdmins() {
  const rows = readCsv("platform_admins").map((row) => ({ user_id: row.user_id }));
  const { error } = await admin.from("platform_admins").upsert(rows, { onConflict: "user_id" });
  if (error) throw new Error(`seeding platform_admins failed: ${error.message}`);
  console.log(`platform_admins: ${rows.length} upserted`);
}

async function seedMemberships() {
  const rows = readCsv("memberships").map((row) => ({
    id: row.id,
    school_id: row.school_id,
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
  }));
  const { error } = await admin.from("memberships").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`seeding memberships failed: ${error.message}`);
  console.log(`memberships: ${rows.length} upserted`);
}

async function main() {
  // Load order per seed/README.md: auth users (-> profiles), schools,
  // platform_admins, memberships.
  await seedAuthUsersAndProfiles();
  await seedSchools();
  await seedPlatformAdmins();
  await seedMemberships();
  console.log("Seed complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
