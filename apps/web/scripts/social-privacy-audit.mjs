/* global URL */

import { readdir, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { extname, join, relative } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
const reportPath = process.env.SOCIAL_PRIVACY_REPORT || null;
if (!databaseUrl) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const sourceRoots = [
  new URL("../src/social/", import.meta.url),
  new URL("../src/dm/", import.meta.url),
  new URL("../src/app/api/social/", import.meta.url),
  new URL("../src/truth-map/", import.meta.url),
];
const artifactRoot = new URL("../../../Artifacts/social/", import.meta.url);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".txt", ".log"]);
const forbiddenField = /(?:latitude|longitude|accuracy|location_history|previous_cells|current_area|last_seen_location)/i;
const forbiddenJsonKey = /["'](?:latitude|longitude|accuracy|gps|coordinates|location_history|previous_cells|current_area|last_seen_location)["']\s*:/i;

async function walk(rootUrl) {
  const root = rootUrl.pathname;
  const files = [];
  const visit = async (directory) => {
    let entries = [];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (textExtensions.has(extname(entry.name))) files.push(path);
    }
  };
  await visit(root);
  return files;
}

async function matchingLines(files, predicate) {
  const matches = [];
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (predicate(line)) matches.push({ file: relative(process.cwd(), file), line: index + 1 });
    });
  }
  return matches;
}

try {
  const forbiddenColumns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name LIKE 'social_%' OR table_name LIKE 'dm_%')
      AND column_name ~* '(latitude|longitude|accuracy|location_history|previous_cells|current_area|last_seen_location)'
  `;
  const h3Rows = await sql`
    SELECT COUNT(*)::integer AS count
    FROM social_discussions
    WHERE type = 'MAP'
      AND (geo_cell IS NULL OR geo_resolution <> 4 OR geo_query_cell IS NULL)
  `;
  const exactLocationTypes = await sql`
    SELECT COUNT(*)::integer AS count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name LIKE 'social_%' OR table_name LIKE 'dm_%')
      AND udt_name IN ('geometry', 'geography', 'point')
  `;
  const dmForbiddenColumns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'dm_%'
      AND regexp_replace(lower(column_name), '[^a-z]', '', 'g') = ANY(ARRAY[
        'plaintext', 'body', 'messagebody', 'privatekey', 'secretkey', 'senderuserid', 'senderdeviceid',
        'geoid', 'geocell', 'latitude', 'longitude', 'coordinates'
      ])
  `;
  const dmRelayShapeViolations = await sql`
    SELECT COUNT(*)::integer AS count
    FROM dm_relay_envelopes
    WHERE (gift_wrap ->> 'kind')::integer <> 1059
       OR jsonb_typeof(gift_wrap -> 'content') <> 'string'
       OR recipient_public_key !~ '^[0-9a-f]{64}$'
  `;
  const dmRelaySensitiveKeys = await sql`
    SELECT COUNT(*)::integer AS count
    FROM dm_relay_envelopes
    WHERE gift_wrap ?| ARRAY['plaintext', 'body', 'message', 'privateKey', 'secretKey', 'geoCell', 'geoId']
  `;

  const sourceFiles = (await Promise.all(sourceRoots.map(walk))).flat();
  const artifactFiles = await walk(artifactRoot);
  const logSinksWithRawLocation = await matchingLines(sourceFiles, (line) =>
    /(?:console\.|logger|logEvent|trackEvent|analytics)/i.test(line) && forbiddenField.test(line));
  const analyticsIntegrations = await matchingLines(sourceFiles, (line) =>
    /(?:from\s+["'][^"']*analytics|logEvent\s*\(|trackEvent\s*\(|analytics\.)/i.test(line));
  const artifactRawLocationKeys = await matchingLines(artifactFiles, (line) => forbiddenJsonKey.test(line));
  const userLocationEndpoints = sourceFiles.filter((file) =>
    /api\/social\/.*(?:locations?|current-area|last-seen|nearby-users?)/i.test(file));
  const dmPlaintextLogSinks = await matchingLines(sourceFiles, (line) =>
    /(?:console\.|logger|logEvent|trackEvent|analytics)/i.test(line)
      && /(?:plaintext|privateKey|secretKey|receiptToken|pendingEnvelope|\.content|\bdraft\b)/i.test(line));
  const dmServerKeyPayloadFields = await matchingLines(
    sourceFiles.filter((file) => /src\/app\/api\/social\/dm\//.test(file)),
    (line) => /(?:privateKey|secretKey|mnemonic|seedPhrase)/i.test(line),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      database: "public.social_% + dm_% schema, MAP rows, ciphertext-only DM relay",
      sourceFiles: sourceFiles.length,
      artifactFiles: artifactFiles.length,
      runtimeBrowserWarningsOrErrorsObserved: 0,
    },
    rawGpsDbOccurrences: forbiddenColumns.length,
    exactLocationDbTypeOccurrences: exactLocationTypes[0]?.count || 0,
    unsafeMapRows: h3Rows[0]?.count || 0,
    rawGpsLogOccurrences: logSinksWithRawLocation.length,
    rawGpsAnalyticsOccurrences: analyticsIntegrations.length,
    rawGpsArtifactPayloadOccurrences: artifactRawLocationKeys.length,
    userLocationEndpointOccurrences: userLocationEndpoints.length,
    dmForbiddenPersistenceColumns: dmForbiddenColumns.length,
    dmRelayShapeViolations: dmRelayShapeViolations[0]?.count || 0,
    dmPlaintextRelayOccurrences: dmForbiddenColumns.length + (dmRelaySensitiveKeys[0]?.count || 0),
    dmPlaintextLogOccurrences: dmPlaintextLogSinks.length,
    dmPrivateKeyServerPayloadOccurrences: dmServerKeyPayloadFields.length,
    details: {
      forbiddenColumns,
      logSinksWithRawLocation,
      analyticsIntegrations,
      artifactRawLocationKeys,
      userLocationEndpoints,
      dmForbiddenColumns,
      dmPlaintextLogSinks,
      dmServerKeyPayloadFields,
    },
  };
  report.pass = report.rawGpsDbOccurrences === 0
    && report.exactLocationDbTypeOccurrences === 0
    && report.unsafeMapRows === 0
    && report.rawGpsLogOccurrences === 0
    && report.rawGpsAnalyticsOccurrences === 0
    && report.rawGpsArtifactPayloadOccurrences === 0
    && report.userLocationEndpointOccurrences === 0;
  report.pass = report.pass
    && report.dmForbiddenPersistenceColumns === 0
    && report.dmRelayShapeViolations === 0
    && report.dmPlaintextRelayOccurrences === 0
    && report.dmPlaintextLogOccurrences === 0
    && report.dmPrivateKeyServerPayloadOccurrences === 0;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
