/* global AbortController, AbortSignal, TextDecoder, URL, crypto, fetch, performance, setTimeout */

import { writeFile } from "node:fs/promises";
import process from "node:process";
import { latLngToCell } from "h3-js";
import postgres from "postgres";

const baseUrl = process.env.SOCIAL_LOAD_BASE_URL || "http://127.0.0.1:3000";
const databaseUrl = process.env.SOCIAL_DATABASE_URL || process.env.DATABASE_URL;
const clientCount = Math.max(1, Number(process.env.SOCIAL_LOAD_CLIENTS || 1_000));
const dbQueryCount = Math.max(1, Number(process.env.SOCIAL_LOAD_DB_QUERIES || 500));
const broadcastCount = Math.max(1, Number(process.env.SOCIAL_LOAD_BROADCASTS || 100));
const churnCount = Math.max(1, Number(process.env.SOCIAL_LOAD_CHURN || 128));
const reportPath = process.env.SOCIAL_LOAD_REPORT || null;

if (!databaseUrl) throw new Error("SOCIAL_DATABASE_NOT_CONFIGURED");

const sql = postgres(databaseUrl, { max: 20, prepare: false });
const rssBefore = process.memoryUsage().rss;
const hotCell = latLngToCell(40.7128, -74.006, 4);

function distribution(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const valueAt = (fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] || 0;
  return {
    count: sorted.length,
    p50Ms: Number(valueAt(0.5).toFixed(2)),
    p95Ms: Number(valueAt(0.95).toFixed(2)),
    p99Ms: Number(valueAt(0.99).toFixed(2)),
    maxMs: Number((sorted.at(-1) || 0).toFixed(2)),
  };
}

async function runApiPhase(name, urls) {
  const phaseStart = performance.now();
  const latencies = [];
  let errors = 0;
  let rateLimited = 0;
  const statusCounts = {};
  const errorCodes = {};
  await Promise.all(urls.map(async (url) => {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { Accept: "application/json" } });
      const body = await response.text();
      statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
      if (!response.ok) {
        errors += 1;
        let code = `HTTP_${response.status}`;
        try {
          code = JSON.parse(body)?.error?.code || code;
        } catch {
          // Non-JSON infrastructure failures retain their HTTP status bucket.
        }
        errorCodes[code] = (errorCodes[code] || 0) + 1;
      }
      if (response.status === 429) rateLimited += 1;
    } catch (error) {
      errors += 1;
      const code = error instanceof Error ? error.name : "NETWORK_ERROR";
      errorCodes[code] = (errorCodes[code] || 0) + 1;
    } finally {
      latencies.push(performance.now() - startedAt);
    }
  }));
  const wallMs = performance.now() - phaseStart;
  return {
    name,
    clients: urls.length,
    errors,
    errorRate: Number((errors / urls.length).toFixed(6)),
    statusCounts,
    errorCodes,
    rateLimited,
    messagesPerSecond: Number((urls.length / (wallMs / 1_000)).toFixed(2)),
    wallMs: Number(wallMs.toFixed(2)),
    latency: distribution(latencies),
  };
}

function coldCell(index) {
  const latitude = -60 + (index % 120);
  const longitude = -170 + ((index * 37) % 340);
  return latLngToCell(latitude, longitude, 4);
}

function discussionsUrl(cell) {
  const url = new URL("/api/social/discussions", baseUrl);
  url.searchParams.set("type", "MAP");
  url.searchParams.set("cells", cell);
  url.searchParams.set("sort", "NEW");
  url.searchParams.set("limit", "30");
  return url.toString();
}

async function waitForSseReady(response, onSocial) {
  if (!response.ok || !response.body) throw new Error(`SOCIAL_LOAD_SSE_${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let ready = false;
  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        eventName = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (eventName === "ready") ready = true;
        if (eventName === "degraded") throw new Error("SOCIAL_LOAD_SSE_DEGRADED");
        if (eventName === "social" && data) onSocial?.(JSON.parse(data));
        boundary = buffer.indexOf("\n\n");
      }
    }
  })();
  const deadline = Date.now() + 15_000;
  while (!ready && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!ready) throw new Error("SOCIAL_LOAD_SSE_READY_TIMEOUT");
  return { reader, pump };
}

async function openChurnSubscription() {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/social/events?cells=${hotCell}`, { signal: controller.signal });
  try {
    const stream = await waitForSseReady(response);
    controller.abort();
    await stream.pump.catch((error) => {
      if (error?.name !== "AbortError") throw error;
    });
  } finally {
    controller.abort();
  }
}

async function postgresListenCount() {
  const rows = await sql`
    SELECT COUNT(*)::integer AS count
    FROM pg_stat_activity
    WHERE usename = current_user
      AND query ~* 'LISTEN.*islegal_social_events'
  `;
  return rows[0]?.count || 0;
}

async function realtimeMetrics() {
  const response = await fetch(`${baseUrl}/api/social/realtime/status`, {
    signal: AbortSignal.timeout(5_000),
    headers: { "x-social-load-probe": "1" },
  });
  if (!response.ok) throw new Error(`SOCIAL_REALTIME_METRICS_${response.status}`);
  return (await response.json()).realtime;
}

async function waitForSubscriberCount(expected) {
  const deadline = Date.now() + 5_000;
  let metrics = await realtimeMetrics();
  while (metrics.activeSubscribers !== expected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    metrics = await realtimeMetrics();
  }
  return metrics;
}

try {
  await fetch(discussionsUrl(hotCell), { signal: AbortSignal.timeout(15_000) });
  const hotApi = await runApiPhase("hot_cell", Array.from({ length: clientCount }, () => discussionsUrl(hotCell)));
  const coldApi = await runApiPhase("many_cold_cells", Array.from({ length: clientCount }, (_, index) => discussionsUrl(coldCell(index))));

  const dbLatencies = [];
  await Promise.all(Array.from({ length: dbQueryCount }, async (_, index) => {
    const startedAt = performance.now();
    await sql`
      SELECT id FROM social_discussions
      WHERE type = 'MAP'
        AND geo_query_cell = ${index % 2 === 0 ? hotCell : coldCell(index)}
        AND status = 'ACTIVE'
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 30
    `;
    dbLatencies.push(performance.now() - startedAt);
  }));

  const broadcastLatencies = [];
  const issuedAt = new Map();
  const receivedIds = new Set();
  const broadcastController = new AbortController();
  const broadcastResponse = await fetch(`${baseUrl}/api/social/events?cells=${hotCell}`, { signal: broadcastController.signal });
  const broadcastStream = await waitForSseReady(broadcastResponse, (event) => {
    const start = issuedAt.get(event.id);
    if (start === undefined || receivedIds.has(event.id)) return;
    receivedIds.add(event.id);
    broadcastLatencies.push(performance.now() - start);
  });
  for (let index = 0; index < broadcastCount; index += 1) {
    const id = crypto.randomUUID();
    issuedAt.set(id, performance.now());
    await sql.notify("islegal_social_events", JSON.stringify({
      id,
      type: "DISCUSSION_UPDATED",
      discussionId: crypto.randomUUID(),
      version: `load:${index}`,
      queryCell: hotCell,
    }));
  }
  const broadcastDeadline = Date.now() + 15_000;
  while (receivedIds.size < broadcastCount && Date.now() < broadcastDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  broadcastController.abort();
  await broadcastStream.pump.catch((error) => {
    if (error?.name !== "AbortError") throw error;
  });

  const realtimeBeforeChurn = await waitForSubscriberCount(0);
  const dbListenBackendsBeforeChurn = await postgresListenCount();
  const churnBatchSize = 8;
  for (let offset = 0; offset < churnCount; offset += churnBatchSize) {
    const batchSize = Math.min(churnBatchSize, churnCount - offset);
    await Promise.all(Array.from({ length: batchSize }, () => openChurnSubscription()));
  }
  const realtimeAfterChurn = await waitForSubscriberCount(realtimeBeforeChurn.activeSubscribers);
  const dbListenBackendsAfterChurn = await postgresListenCount();
  const staleSubscriptions = Math.max(0, realtimeAfterChurn.activeSubscribers - realtimeBeforeChurn.activeSubscribers);

  const connections = await sql`
    SELECT COUNT(*)::integer AS count
    FROM pg_stat_activity
    WHERE usename = current_user
  `;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    profile: {
      concurrentClientsPerApiPhase: clientCount,
      dbQueries: dbQueryCount,
      broadcastEvents: broadcastCount,
      subscriptionChurn: churnCount,
    },
    api: { hot: hotApi, cold: coldApi },
    db: { latency: distribution(dbLatencies) },
    broadcast: {
      received: receivedIds.size,
      expected: broadcastCount,
      latency: distribution(broadcastLatencies),
    },
    realtime: {
      activeSubscribersBeforeChurn: realtimeBeforeChurn.activeSubscribers,
      activeSubscribersAfterChurn: realtimeAfterChurn.activeSubscribers,
      staleSubscriptionsAfterViewportChange: staleSubscriptions,
      sharedListenerConnected: realtimeAfterChurn.listenerConnected,
      dbListenBackendsBeforeChurn,
      dbListenBackendsAfterChurn,
    },
    resources: {
      dbConnectionsObserved: connections[0]?.count || 0,
      runnerRssDeltaBytes: process.memoryUsage().rss - rssBefore,
    },
  };
  report.pass = hotApi.errors === 0
    && coldApi.errors === 0
    && receivedIds.size === broadcastCount
    && staleSubscriptions === 0;
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
