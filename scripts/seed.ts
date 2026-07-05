/**
 * Seed contacts from a CSV export (e.g. a Google Sheet).
 *
 * CSV columns (header row required):
 *   name,company,title,email,linkedin_url,vertical,tier,notes
 *
 * Usage:
 *   npm run seed                          # inserts scripts/sample-contacts.csv
 *   npm run seed -- --file path/to.csv    # custom file
 *   npm run seed -- --dry-run             # parse + validate only, no DB writes
 *   npm run seed -- --user <uuid>         # attach rows to a specific user_id
 *
 * Auth / user_id resolution (single-user app, RLS scoped to user_id):
 *   1) --user <uuid> flag, else
 *   2) SEED_USER_ID env var, else
 *   3) the first user returned by the Supabase Auth admin API.
 *
 * Requires (except in --dry-run): NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local. The service role key BYPASSES RLS,
 * so this script is for local/trusted use only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load env from .env.local first, then .env.
config({ path: ".env.local" });
config({ path: ".env" });

const TIERS = ["priority", "warm", "background"] as const;
type Tier = (typeof TIERS)[number];

interface CsvRow {
  name?: string;
  company?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  vertical?: string;
  tier?: string;
  notes?: string;
}

interface ContactInsert {
  user_id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  vertical: string | null;
  tier: Tier;
  notes: string | null;
}

function parseArgs(argv: string[]) {
  const args = { file: "scripts/sample-contacts.csv", dryRun: false, user: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--file") args.file = argv[++i] ?? args.file;
    else if (a === "--user") args.user = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: npm run seed -- [--file <csv>] [--dry-run] [--user <uuid>]",
      );
      process.exit(0);
    }
  }
  return args;
}

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function normalizeTier(v: string | undefined): { tier: Tier; warn?: string } {
  const t = (v ?? "").trim().toLowerCase();
  if ((TIERS as readonly string[]).includes(t)) return { tier: t as Tier };
  return {
    tier: "warm",
    warn: t ? `unknown tier "${t}", defaulting to "warm"` : undefined,
  };
}

function toInserts(rows: CsvRow[], userId: string): ContactInsert[] {
  const inserts: ContactInsert[] = [];
  rows.forEach((row, idx) => {
    const name = clean(row.name);
    if (!name) {
      console.warn(`  row ${idx + 2}: skipped (missing name)`);
      return;
    }
    const { tier, warn } = normalizeTier(row.tier);
    if (warn) console.warn(`  row ${idx + 2} (${name}): ${warn}`);
    inserts.push({
      user_id: userId,
      name,
      company: clean(row.company),
      title: clean(row.title),
      email: clean(row.email),
      linkedin_url: clean(row.linkedin_url),
      vertical: clean(row.vertical),
      tier,
      notes: clean(row.notes),
    });
  });
  return inserts;
}

async function resolveUserId(
  args: ReturnType<typeof parseArgs>,
): Promise<string> {
  if (args.user) return args.user;
  if (process.env.SEED_USER_ID) return process.env.SEED_USER_ID;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
        "Set them in .env.local, or pass --user <uuid>, or use --dry-run.",
    );
  }
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  const first = data.users[0];
  if (!first) {
    throw new Error(
      "No users found. Sign in once via the app to create your user, " +
        "then re-run seed (or pass --user <uuid>).",
    );
  }
  return first.id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = resolve(process.cwd(), args.file);

  const raw = readFileSync(filePath, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  console.log(`Parsed ${rows.length} row(s) from ${args.file}`);

  // In dry-run we don't need a real user_id.
  const userId = args.dryRun
    ? "00000000-0000-0000-0000-000000000000"
    : await resolveUserId(args);

  const inserts = toInserts(rows, userId);
  console.log(`Prepared ${inserts.length} contact(s) for insert.`);

  if (args.dryRun) {
    console.table(
      inserts.map((c) => ({
        name: c.name,
        company: c.company,
        tier: c.tier,
        vertical: c.vertical,
        email: c.email,
      })),
    );
    console.log("\nDry run complete — no rows written.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("contacts")
    .insert(inserts)
    .select("id");
  if (error) throw error;

  console.log(`Inserted ${data?.length ?? 0} contact(s) for user ${userId}.`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
