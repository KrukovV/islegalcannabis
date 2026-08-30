import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres, { type Sql } from "postgres";
import { validateDmSubmissionAuthorization } from "@/dm/nip17Candidate";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
const liveEnabled = process.env.SOCIAL_UI_LIVE_TEST === "1" && Boolean(databaseUrl);
const TEST_ROUTE = "/truth-map?qa=1&lat=0&lng=0&zoom=10";
const DM_EVIDENCE_DIR = process.env.SOCIAL_DM_EVIDENCE_DIR || path.join(homedir(), "islegalcannabis_archive", "social-dm-live");
const FORBIDDEN_DM_LOCATION_KEYS = new Set([
  "latitude", "longitude", "accuracy", "gps", "coordinates", "geocell", "geoid", "lawid",
]);

function forbiddenDmLocationKeys(value: unknown, matches: string[] = []) {
  if (!value || typeof value !== "object") return matches;
  if (Array.isArray(value)) {
    value.forEach((entry) => forbiddenDmLocationKeys(entry, matches));
    return matches;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (FORBIDDEN_DM_LOCATION_KEYS.has(normalized)) matches.push(key);
    forbiddenDmLocationKeys(nested, matches);
  }
  return matches;
}

async function join(page: import("@playwright/test").Page, displayName: string) {
  await page.goto(TEST_ROUTE, { waitUntil: "domcontentloaded" });
  console.warn(`PASS_DM_LIVE_JOIN=${displayName}:GOTO`);
  await expect(page.getByTestId("truth-map-social-chat")).toHaveAttribute("data-social-chat-status", "ACTIVE");
  await expect(page.getByTestId("truth-map-social-realtime")).toHaveText("LIVE", { timeout: 35_000 });
  await page.getByTestId("truth-map-social-name").fill(displayName, { timeout: 10_000 });
  await expect(page.getByTestId("truth-map-social-sign-in")).toBeEnabled({ timeout: 10_000 });
  console.warn(`PASS_DM_LIVE_JOIN=${displayName}:FILLED`);
  await page.getByTestId("truth-map-social-sign-in").click({ timeout: 10_000 });
  console.warn(`PASS_DM_LIVE_JOIN=${displayName}:CLICKED`);
  await expect(page.getByTestId("truth-map-social-identity")).toHaveText(displayName, { timeout: 15_000 });
  console.warn(`PASS_DM_LIVE_JOIN=${displayName}:IDENTITY`);
  await expect(page.getByTestId("truth-map-dm")).toHaveAttribute("data-dm-status", "ACTIVE", { timeout: 20_000 });
  await expect(page.getByTestId("truth-map-dm-status")).toHaveText("DM_DEVICE_READY", { timeout: 20_000 });
  console.warn(`PASS_DM_LIVE_JOIN=${displayName}:DEVICE_READY`);
}

async function reopenDm(page: import("@playwright/test").Page, displayName: string) {
  await page.goto(TEST_ROUTE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("truth-map-social-identity")).toHaveText(displayName, { timeout: 15_000 });
  await expect(page.getByTestId("truth-map-dm")).toHaveAttribute("data-dm-status", "ACTIVE", { timeout: 45_000 });
  await expect(page.getByTestId("truth-map-dm-status")).toHaveText(/DM_(DEVICE_READY|MESSAGE_DECRYPTED_AND_READ)/, { timeout: 45_000 });
}

async function cleanupUsers(sql: Sql, displayNames: string[]) {
  const keys = displayNames.map((name) => name.toLowerCase());
  const users = await sql<Array<{ id: string }>>`
    SELECT id FROM social_users WHERE display_name_key = ${keys[0]} OR display_name_key = ${keys[1]}
  `;
  const ids = users.map((user) => user.id);
  if (ids.length === 0) return;
  for (const id of ids) {
    await sql`DELETE FROM social_user_rate_limits WHERE user_id = ${id}`;
    await sql`DELETE FROM social_user_profiles WHERE user_id = ${id}`;
    await sql`DELETE FROM social_sessions WHERE user_id = ${id}`;
    await sql`DELETE FROM social_users WHERE id = ${id}`;
  }
}

async function closeContextBounded(context: Awaited<ReturnType<import("@playwright/test").Browser["newContext"]>> | null) {
  if (!context) return;
  await Promise.race([
    context.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
}

test("two-user multi-device DM stays ciphertext-only, queues offline, resumes, decrypts, and receipts READ", async ({ browser }) => {
  test.setTimeout(300_000);
  test.skip(!liveEnabled, "requires explicit SOCIAL_UI_LIVE_TEST=1 and local Social PostgreSQL");
  const sql = postgres(databaseUrl!, { max: 2, prepare: false });
  const suffix = randomUUID().slice(0, 12);
  const alphaName = `dm-alpha-${suffix}`;
  const betaName = `dm-beta-${suffix}`;
  const plaintext = `live private restart proof ${suffix}`;
  let alphaContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let betaOfflineContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let betaOnlineContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

  try {
    alphaContext = await browser.newContext();
    betaOfflineContext = await browser.newContext();
    const alpha = await alphaContext.newPage();
    const betaOffline = await betaOfflineContext.newPage();
    for (const [label, page] of [["ALPHA", alpha], ["BETA_OFFLINE", betaOffline]] as const) {
      page.on("pageerror", (error) => console.warn(`CI_DM_LIVE_PAGE_ERROR=${label}:${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") console.warn(`CI_DM_LIVE_CONSOLE_ERROR=${label}:${message.text()}`);
      });
    }
    await join(alpha, alphaName);
    await join(betaOffline, betaName);
    console.warn("PASS_DM_LIVE_STAGE=PRIMARY_DEVICES_READY");

    const betaState = await betaOfflineContext.storageState();
    betaOnlineContext = await browser.newContext({ storageState: betaState });
    const betaOnline = await betaOnlineContext.newPage();
    await reopenDm(betaOnline, betaName);
    console.warn("PASS_DM_LIVE_STAGE=SECOND_DEVICE_READY");

    const betaUsers = await sql<Array<{ id: string }>>`
      SELECT id FROM social_users WHERE display_name_key = ${betaName.toLowerCase()}
    `;
    expect(betaUsers).toHaveLength(1);
    const registeredDevices = await sql<Array<{ count: number }>>`
      SELECT COUNT(*)::integer AS count FROM dm_devices
      WHERE user_id = ${betaUsers[0].id} AND status = 'ACTIVE'
    `;
    expect(registeredDevices[0].count).toBe(2);
    console.warn("PASS_DM_LIVE_STAGE=MULTI_DEVICE_DB_PASS");

    await betaOffline.close();
    const relayPayloads: string[] = [];
    alpha.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/social/dm/relay/send" && request.method() === "POST") {
        relayPayloads.push(request.postData() || "");
      }
    });
    await alpha.getByTestId("truth-map-dm-recipient").fill(betaName);
    await alpha.getByTestId("truth-map-dm-lookup").click();
    await expect(alpha.getByTestId("truth-map-dm-recipient-ready")).toContainText("2 активных устройства", { timeout: 15_000 });
    await alpha.getByTestId("truth-map-dm-composer").fill(plaintext);
    await alpha.getByTestId("truth-map-dm-send").click();
    await expect(alpha.getByTestId("truth-map-dm-status")).toHaveText("DM_CIPHERTEXT_TRANSPORT_ACCEPTED", { timeout: 20_000 });
    await expect.poll(() => relayPayloads.length, { timeout: 10_000 }).toBe(2);
    const senderDevices = await sql<Array<{ public_key: string }>>`
      SELECT messaging_public_key AS public_key FROM dm_devices
      WHERE user_id = (SELECT id FROM social_users WHERE display_name_key = ${alphaName.toLowerCase()})
        AND status = 'ACTIVE'
    `;
    const submissionBindings = relayPayloads.map((body) => {
      const payload = JSON.parse(body) as {
        messageId?: unknown;
        recipientPublicKey?: unknown;
        submissionAuthorization?: { pubkey?: unknown; tags?: unknown; kind?: unknown; content?: unknown };
      };
      const authorization = payload.submissionAuthorization;
      const tags = Array.isArray(authorization?.tags) ? authorization.tags : [];
      const senderPublicKey = senderDevices.find((device) => device.public_key === authorization?.pubkey)?.public_key || "";
      let validatesUnderCurrentSource = true;
      try {
        validateDmSubmissionAuthorization(authorization, senderPublicKey, String(payload.messageId || ""), String(payload.recipientPublicKey || ""));
      } catch {
        validatesUnderCurrentSource = false;
      }
      return {
        validMessageId: typeof payload.messageId === "string" && /^[0-9a-f]{64}$/.test(payload.messageId),
        senderKeyMatchesRegisteredDevice: senderDevices.some((device) => device.public_key === authorization?.pubkey),
        authorizationShapeValid: authorization?.kind === 22_243 && authorization.content === "islegal-dm-submit",
        messageIdMatchesAuthorization: tags.some((tag) => Array.isArray(tag) && tag[0] === "e" && tag[1] === payload.messageId),
        recipientMatchesAuthorization: tags.some((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === payload.recipientPublicKey),
        validatesUnderCurrentSource,
      };
    });
    console.warn(`PASS_DM_LIVE_SUBMISSION_BINDING=${JSON.stringify(submissionBindings)}`);
    expect(submissionBindings).toHaveLength(2);
    expect(submissionBindings.every((binding) => (
      binding.validMessageId
      && binding.senderKeyMatchesRegisteredDevice
      && binding.authorizationShapeValid
      && binding.messageIdMatchesAuthorization
      && binding.recipientMatchesAuthorization
      && binding.validatesUnderCurrentSource
    ))).toBe(true);
    console.warn("PASS_DM_LIVE_STAGE=CIPHERTEXT_ACCEPTED");
    for (const body of relayPayloads) {
      expect(body).not.toContain(plaintext);
      expect(forbiddenDmLocationKeys(JSON.parse(body))).toEqual([]);
    }

    await expect(betaOnline.getByTestId("truth-map-dm-messages")).toContainText(plaintext, { timeout: 20_000 });
    await expect(betaOnline.getByTestId("truth-map-dm-messages").locator("article")).toHaveAttribute("data-message-state", "READ");
    console.warn("PASS_DM_LIVE_STAGE=ONLINE_DEVICE_READ");

    const queuedRows = await sql<Array<{ message_id: string; status: string; serialized: string }>>`
      SELECT envelopes.message_id, envelopes.status, envelopes.gift_wrap::text AS serialized
      FROM dm_relay_envelopes envelopes
      JOIN dm_devices devices ON devices.id = envelopes.recipient_device_id
      WHERE devices.user_id = ${betaUsers[0].id}
      ORDER BY envelopes.created_at ASC
    `;
    expect(queuedRows).toHaveLength(2);
    expect(new Set(queuedRows.map((row) => row.message_id)).size).toBe(1);
    expect(queuedRows.every((row) => !row.serialized.includes(plaintext))).toBe(true);
    expect(queuedRows.some((row) => row.status === "TRANSPORT_ACCEPTED")).toBe(true);
    expect(queuedRows.some((row) => row.status === "READ")).toBe(true);
    console.warn("PASS_DM_LIVE_STAGE=OFFLINE_QUEUE_DB_PASS");

    const betaRestarted = await betaOfflineContext.newPage();
    await reopenDm(betaRestarted, betaName);
    await expect(betaRestarted.getByTestId("truth-map-dm-messages")).toContainText(plaintext, { timeout: 20_000 });
    await expect(betaRestarted.getByTestId("truth-map-dm-messages").locator("article")).toHaveAttribute("data-message-state", "READ", { timeout: 15_000 });
    console.warn("PASS_DM_LIVE_STAGE=OFFLINE_DEVICE_RESTART_READ");
    await expect(alpha.getByTestId("truth-map-dm-messages").locator("article[data-message-state='READ']"))
      .toHaveCount(1, { timeout: 20_000 });
    console.warn("PASS_DM_LIVE_STAGE=SENDER_RECEIPTS_READ");

    await mkdir(DM_EVIDENCE_DIR, { recursive: true });
    await alpha.getByTestId("truth-map-dm-messages").getByText(plaintext).scrollIntoViewIfNeeded();
    await alpha.getByTestId("truth-map-dm").screenshot({
      path: path.join(DM_EVIDENCE_DIR, "dm-live-sender-read.png"),
    });
    await betaRestarted.getByTestId("truth-map-dm-messages").getByText(plaintext).scrollIntoViewIfNeeded();
    await betaRestarted.getByTestId("truth-map-dm").screenshot({
      path: path.join(DM_EVIDENCE_DIR, "dm-live-offline-restart.png"),
    });
    console.warn("PASS_DM_LIVE_STAGE=SCREENSHOT_EVIDENCE_CAPTURED");
    await writeFile(
      path.join(DM_EVIDENCE_DIR, "dm-live-acceptance.json"),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        status: "PASS",
        browser: "webkit",
        recipientActiveDevices: registeredDevices[0].count,
        relayPayloads: relayPayloads.length,
        relayPlaintextOccurrences: relayPayloads.filter((body) => body.includes(plaintext)).length,
        relayGeoMetadataOccurrences: relayPayloads.reduce((count, body) => count + forbiddenDmLocationKeys(JSON.parse(body)).length, 0),
        databasePlaintextOccurrences: queuedRows.filter((row) => row.serialized.includes(plaintext)).length,
        logicalMessageIds: new Set(queuedRows.map((row) => row.message_id)).size,
        signedSubmissionBindingsPassed: submissionBindings.filter((binding) => Object.values(binding).every(Boolean)).length,
        onlineDeviceRead: queuedRows.some((row) => row.status === "READ"),
        offlineDeviceQueuedThenReadAfterRestart: true,
        senderReadReceiptReconciled: true,
        exactFixtureCleanup: "FINALLY_BLOCK",
      }, null, 2)}\n`,
      "utf8",
    );

    await betaRestarted.getByTestId("truth-map-dm-messages").getByRole("button", { name: "Удалить с устройства" }).click();
    await expect(betaRestarted.getByTestId("truth-map-dm-messages")).not.toContainText(plaintext);
    await alpha.getByText("Приватность и устройство", { exact: true }).click();
    await expect(alpha.getByRole("button", { name: "Очистить историю личных сообщений на устройстве" })).toBeVisible();
    await alpha.getByRole("button", { name: "Удалить эту переписку с устройства" }).click();
    await expect(alpha.getByTestId("truth-map-dm-messages")).not.toContainText(plaintext);
    console.warn("PASS_DM_LIVE_STAGE=LOCAL_RETENTION_CONTROLS_PASS");
  } finally {
    await Promise.all([
      closeContextBounded(alphaContext),
      closeContextBounded(betaOfflineContext),
      closeContextBounded(betaOnlineContext),
    ]);
    await cleanupUsers(sql, [alphaName, betaName]);
    await sql.end({ timeout: 5 });
  }
});
