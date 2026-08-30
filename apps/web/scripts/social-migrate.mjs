import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const migrationDirectory = path.resolve(process.cwd(), "db/migrations");

try {
  const files = (await fs.readdir(migrationDirectory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const version = path.basename(file, ".sql");
    const exists = await sql`SELECT to_regclass('public.social_schema_migrations') AS registry`;
    const applied = exists[0]?.registry
      ? await sql`SELECT 1 FROM social_schema_migrations WHERE version = ${version}`
      : [];
    if (applied.length > 0) continue;
    const migration = await fs.readFile(path.join(migrationDirectory, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(migration);
      await tx`
        INSERT INTO social_schema_migrations (version)
        VALUES (${version})
        ON CONFLICT (version) DO NOTHING
      `;
    });
  }
  const rows = await sql`SELECT version, applied_at FROM social_schema_migrations ORDER BY applied_at`;
  process.stdout.write(`SOCIAL_MIGRATION_OK=1 versions=${rows.map((row) => row.version).join(",")}\n`);
} finally {
  await sql.end({ timeout: 5 });
}
