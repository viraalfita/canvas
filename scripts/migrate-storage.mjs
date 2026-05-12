#!/usr/bin/env node
/**
 * Migrate all files in the `outputs` bucket from old Supabase project to new one.
 *
 * Usage:
 *   OLD_URL=https://ghfgzzrgqckxbdtolcfc.supabase.co \
 *   OLD_SVC=<old service role key> \
 *   NEW_URL=https://pllqimsgbgkzffzbrwma.supabase.co \
 *   NEW_SVC=<new service role key> \
 *   node scripts/migrate-storage.mjs
 *
 * Idempotent: re-running skips files that already exist (upsert: true).
 */

import { createClient } from "@supabase/supabase-js";

const { OLD_URL, OLD_SVC, NEW_URL, NEW_SVC } = process.env;
if (!OLD_URL || !OLD_SVC || !NEW_URL || !NEW_SVC) {
  console.error("Missing env: OLD_URL, OLD_SVC, NEW_URL, NEW_SVC");
  process.exit(1);
}

const BUCKET = "outputs";

const OLD = createClient(OLD_URL, OLD_SVC, {
  auth: { persistSession: false },
});
const NEW = createClient(NEW_URL, NEW_SVC, {
  auth: { persistSession: false },
});

/** Recursively list all files in a bucket, descending into folders. */
async function listAll(prefix = "") {
  const out = [];
  let offset = 0;
  while (true) {
    const { data, error } = await OLD.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
    });
    if (error) throw new Error(`list "${prefix}" failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Supabase Storage marks folders with id === null (no metadata).
      if (item.id === null) {
        out.push(...(await listAll(path)));
      } else {
        out.push(path);
      }
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function migrate() {
  console.log(`Listing files in old bucket "${BUCKET}"...`);
  const files = await listAll();
  console.log(`Found ${files.length} files\n`);

  let ok = 0;
  let fail = 0;
  for (const [i, path] of files.entries()) {
    const prefix = `[${i + 1}/${files.length}]`;
    try {
      const { data: blob, error: dlErr } = await OLD.storage
        .from(BUCKET)
        .download(path);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);

      const { error: upErr } = await NEW.storage.from(BUCKET).upload(path, blob, {
        upsert: true,
        contentType: blob.type || "application/octet-stream",
      });
      if (upErr) throw new Error(`upload: ${upErr.message}`);

      console.log(`${prefix} ✓ ${path}`);
      ok++;
    } catch (e) {
      console.error(`${prefix} ✗ ${path} — ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

migrate().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
