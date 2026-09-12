#!/usr/bin/env node
/**
 * Applies drizzle/*.sql in filename order, once each.
 *
 * Written by hand rather than using drizzle-kit because this project's migration metadata
 * is not trustworthy: drizzle/meta/_journal.json still claims dialect "mysql" and lists
 * only 0000-0002 while drizzle/ holds ten Postgres .sql files, and snapshots exist only
 * for the first three. `drizzle-kit generate` against that would emit a bogus diff.
 *
 * The _migrations tracking table is required, not a nicety: 0004_reel_media_storage.sql
 * uses bare `create policy` with no `if not exists`, so re-running it errors.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs             apply what is pending
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs --dry-run   list what would run
 *   DATABASE_URL=postgres://... node scripts/migrate.mjs --baseline  mark 0000-0009 as
 *     already applied WITHOUT running them. Use this once against the existing managed
 *     Supabase database, where those files were applied by hand -- re-running them would
 *     fail on 0004's unguarded `create policy`.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "..", "drizzle");
const dryRun = process.argv.includes("--dry-run");
const baseline = process.argv.includes("--baseline");
/** Everything written before scripts/migrate.mjs existed, i.e. applied out-of-band. */
const BASELINE_THROUGH = "0009";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15, idle_timeout: 5 });

try {
  await sql`
    create table if not exists "_migrations" (
      "filename" text primary key,
      "applied_at" timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
  const applied = new Set((await sql`select "filename" from "_migrations"`).map(row => row.filename));

  if (baseline) {
    const pre = files.filter(f => f.slice(0, 4) <= BASELINE_THROUGH && !applied.has(f));
    for (const file of pre) {
      await sql`insert into "_migrations" ("filename") values (${file}) on conflict do nothing`;
      console.log(`  BASELINED  ${file}`);
    }
    console.log(`${pre.length} migration(s) marked as already applied. Re-run without --baseline to apply the rest.`);
    process.exit(0);
  }

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const contents = await readFile(path.join(migrationsDir, file), "utf8");
    if (dryRun) {
      console.log(`  WOULD APPLY  ${file}`);
      ran += 1;
      continue;
    }

    // Each file commits as a unit, so a failure part-way through leaves the file
    // unrecorded and the database unchanged rather than half-migrated.
    await sql.begin(async tx => {
      await tx.unsafe(contents);
      await tx`insert into "_migrations" ("filename") values (${file})`;
    });
    console.log(`  APPLIED  ${file}`);
    ran += 1;
  }

  console.log(ran === 0 ? "Database is up to date." : `${ran} migration(s) ${dryRun ? "pending" : "applied"}.`);
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
