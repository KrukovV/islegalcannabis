import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { latLngToCell } from "h3-js";
import postgres, { type Sql } from "postgres";

const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
const liveEnabled = process.env.SOCIAL_UI_LIVE_TEST === "1" && Boolean(databaseUrl);
const TEST_POINT = { latitude: 0, longitude: 0 };
const TEST_CELL = latLngToCell(TEST_POINT.latitude, TEST_POINT.longitude, 4);
const TEST_ROUTE = "/truth-map?qa=1&lat=0&lng=0&zoom=10";

async function waitForActiveSocialMap(page: import("@playwright/test").Page) {
  await page.goto(TEST_ROUTE, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("truth-map-social-chat")).toHaveAttribute("data-social-chat-status", "ACTIVE");
  await page.waitForFunction(() => Boolean(window.__TRUTH_MAP_QA__), { timeout: 20_000 });
  await page.waitForFunction(() => window.__TRUTH_MAP_QA__?.getSocialVisibilityLevel() === "DISCUSSION", { timeout: 20_000 });
  await expect(page.getByTestId("truth-map-social-realtime")).toHaveText("LIVE", { timeout: 10_000 });
}

async function join(page: import("@playwright/test").Page, displayName: string) {
  await page.getByTestId("truth-map-social-name").fill(displayName);
  await expect(page.getByTestId("truth-map-social-sign-in")).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId("truth-map-social-sign-in").click();
  await expect(page.getByTestId("truth-map-social-identity")).toHaveText(displayName, { timeout: 30_000 });
}

async function cleanupLiveFixture(sql: Sql, input: { alphaName: string; betaName: string; body: string; rateRowExisted: boolean }) {
  await sql.begin(async (tx) => {
    const users = await tx<Array<{ id: string }>>`
      SELECT id FROM social_users
      WHERE display_name_key = ${input.alphaName.toLowerCase()} OR display_name_key = ${input.betaName.toLowerCase()}
    `;
    const userIds = users.map((user) => user.id);
    const discussions = await tx<Array<{ id: string }>>`
      SELECT id FROM social_discussions WHERE body = ${input.body}
    `;
    const discussionIds = discussions.map((discussion) => discussion.id);
    const comments = discussionIds.length > 0
      ? await tx<Array<{ id: string }>>`
        SELECT id FROM social_comments WHERE discussion_id = ANY(${tx.array(discussionIds)}::uuid[])
      `
      : [];
    const targetIds = [...discussionIds, ...comments.map((comment) => comment.id)];
    if (targetIds.length > 0) {
      await tx`DELETE FROM social_votes WHERE target_id = ANY(${tx.array(targetIds)}::uuid[])`;
      await tx`DELETE FROM social_reports WHERE target_id = ANY(${tx.array(targetIds)}::text[])`;
      await tx`DELETE FROM social_comments WHERE discussion_id = ANY(${tx.array(discussionIds)}::uuid[])`;
      await tx`DELETE FROM social_discussions WHERE id = ANY(${tx.array(discussionIds)}::uuid[])`;
    }
    if (userIds.length > 0) {
      await tx`DELETE FROM social_reports WHERE reporter_id = ANY(${tx.array(userIds)}::text[])`;
      await tx`DELETE FROM social_blocks WHERE blocker_id = ANY(${tx.array(userIds)}::text[]) OR blocked_id = ANY(${tx.array(userIds)}::text[])`;
      await tx`DELETE FROM social_mutes WHERE muter_id = ANY(${tx.array(userIds)}::text[]) OR muted_id = ANY(${tx.array(userIds)}::text[])`;
      await tx`DELETE FROM social_user_rate_limits WHERE user_id = ANY(${tx.array(userIds)}::text[])`;
      await tx`DELETE FROM social_user_profiles WHERE user_id = ANY(${tx.array(userIds)}::text[])`;
      await tx`DELETE FROM social_sessions WHERE user_id = ANY(${tx.array(userIds)}::uuid[])`;
      await tx`DELETE FROM social_users WHERE id = ANY(${tx.array(userIds)}::uuid[])`;
    }
    if (!input.rateRowExisted) {
      await tx`
        DELETE FROM social_cell_rate_limits
        WHERE geo_query_cell = ${TEST_CELL} AND operation = 'DISCUSSION_CREATE'
      `;
    }
  });
}

test("live two-user MAP Social flow delivers realtime without raw GPS persistence", async ({ browser }) => {
  test.setTimeout(180_000);
  test.skip(!liveEnabled, "requires explicit SOCIAL_UI_LIVE_TEST=1 and a local Social database");
  const sql = postgres(databaseUrl!, { max: 1, prepare: false });
  const suffix = randomUUID().slice(0, 12);
  const alphaName = `ui-alpha-${suffix}`;
  const betaName = `ui-beta-${suffix}`;
  const body = `Transactional live Social MAP proof ${suffix}`;
  const comment = `Transactional live Social reply ${suffix}`;
  let rateRowExisted = false;
  let alphaContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  let betaContext: Awaited<ReturnType<typeof browser.newContext>> | null = null;

  try {
    const existingRate = await sql`
      SELECT event_count FROM social_cell_rate_limits
      WHERE geo_query_cell = ${TEST_CELL} AND operation = 'DISCUSSION_CREATE'
    `;
    rateRowExisted = existingRate.length > 0;
    test.skip(rateRowExisted, "dedicated live-test H3 cell already has activity; preserving its rate state");

    alphaContext = await browser.newContext({ geolocation: TEST_POINT, permissions: ["geolocation"] });
    betaContext = await browser.newContext({ geolocation: TEST_POINT, permissions: ["geolocation"] });
    const alpha = await alphaContext.newPage();
    const beta = await betaContext.newPage();
    const socialPayloads: string[] = [];
    alpha.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/social/discussions" && request.method() === "POST") {
        socialPayloads.push(request.postData() || "");
      }
    });

    await Promise.all([waitForActiveSocialMap(alpha), waitForActiveSocialMap(beta)]);
    await Promise.all([join(alpha, alphaName), join(beta, betaName)]);

    await alpha.getByRole("button", { name: "Use privacy-safe current area" }).click();
    await expect(alpha.getByTestId("truth-map-social-status")).toHaveText("PRIVACY_SAFE_AREA_READY", { timeout: 10_000 });
    await alpha.getByTestId("truth-map-social-composer").fill(body);
    const publishedAt = Date.now();
    await alpha.getByTestId("truth-map-social-send").click();
    await expect(alpha.getByTestId("truth-map-social-discussions")).toContainText(body, { timeout: 10_000 });
    await expect(beta.getByTestId("truth-map-social-discussions")).toContainText(body, { timeout: 10_000 });
    expect(Date.now() - publishedAt).toBeLessThan(14_000);
    expect(socialPayloads).toHaveLength(1);
    expect(socialPayloads[0]).not.toMatch(/(?:latitude|longitude|accuracy|gps|coordinates)/i);

    await alpha.waitForFunction(() => {
      const source = window.__TRUTH_MAP_DEBUG__?.map?.getSource("social-map-activity") as {
        serialize?: () => { data?: { features?: Array<{ properties?: { geoCell?: string } }> } };
      } | undefined;
      return source?.serialize?.().data?.features?.some((feature) => typeof feature.properties?.geoCell === "string");
    }, undefined, { timeout: 10_000 });
    await alpha.evaluate(() => window.__TRUTH_MAP_QA__?.jumpTo(0, -0.12, 10));
    const markerPoint = await alpha.evaluate(() => {
      const map = window.__TRUTH_MAP_DEBUG__?.map;
      const source = map?.getSource("social-map-activity") as {
        serialize?: () => { data?: { features?: Array<{ geometry?: { coordinates?: [number, number] } }> } };
      } | undefined;
      const coordinates = source?.serialize?.().data?.features?.[0]?.geometry?.coordinates;
      const point = coordinates ? map?.project(coordinates) : null;
      const bounds = map?.getCanvas().getBoundingClientRect();
      if (!point || !bounds) return null;
      return {
        x: bounds.left + point.x,
        y: bounds.top + point.y,
        localX: point.x,
        localY: point.y,
      };
    });
    expect(markerPoint).not.toBeNull();
    await expect.poll(() => alpha.evaluate(({ localX, localY }) => window.__TRUTH_MAP_DEBUG__?.map
      ?.queryRenderedFeatures([localX, localY], {
        layers: ["social-map-activity-cells", "social-map-activity-counts"],
      })
      .some((feature) => typeof feature.properties?.geoCell === "string") ?? false, markerPoint!), {
      timeout: 20_000,
    }).toBe(true);
    await expect.poll(() => alpha.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return Boolean(target && window.__TRUTH_MAP_DEBUG__?.map?.getCanvas().contains(target));
    }, markerPoint!), { timeout: 10_000 }).toBe(true);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await alpha.mouse.click(markerPoint!.x, markerPoint!.y);
      if (await alpha.getByTestId("truth-map-social-map-area-focus").count()) break;
      await alpha.waitForTimeout(500);
    }
    await expect(alpha.getByTestId("truth-map-social-map-area-focus")).toContainText(/active discussions?/, { timeout: 20_000 });

    await beta.getByTestId("truth-map-social-discussions").getByText(body, { exact: false }).click();
    await expect(beta.getByTestId("truth-map-social-thread")).toBeVisible();
    await beta.getByTestId("truth-map-social-comment").fill(comment);
    await beta.getByTestId("truth-map-social-comment-send").click();
    await expect(beta.getByTestId("truth-map-social-thread")).toContainText(comment, { timeout: 10_000 });
    await expect(alpha.getByTestId("truth-map-social-discussions")).toContainText("1 replies", { timeout: 10_000 });

    await beta.getByTestId("truth-map-social-discussions").getByRole("button", { name: "▲" }).click();
    await expect(alpha.getByTestId("truth-map-social-discussions")).toContainText("1 votes", { timeout: 10_000 });
    await beta.getByTestId("truth-map-social-discussions").getByRole("button", { name: "Report" }).click();
    await expect(beta.getByTestId("truth-map-social-status")).toHaveText("REPORT_RECORDED_FOR_MODERATION", { timeout: 10_000 });
  } finally {
    await Promise.allSettled([alphaContext?.close(), betaContext?.close()]);
    await cleanupLiveFixture(sql, { alphaName, betaName, body, rateRowExisted });
    await sql.end({ timeout: 5 });
  }
});
