import postgres, { type Sql } from "postgres";

let sqlClient: Sql | null = null;

export function socialDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  return env.SOCIAL_DATABASE_URL || env.DATABASE_URL || null;
}

export function getSocialSql(): Sql {
  if (sqlClient) return sqlClient;
  const url = socialDatabaseUrl();
  if (!url) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");
  sqlClient = postgres(url, { max: 8, idle_timeout: 20, prepare: false });
  return sqlClient;
}
