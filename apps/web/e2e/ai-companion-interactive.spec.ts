import { expect, test, type APIRequestContext } from "playwright/test";

const FORBIDDEN_PATTERNS = [/в целом картина такая/i, /overall picture/i, /i may not have context/i];

test.describe.configure({ timeout: 300000 });

async function ask(request: APIRequestContext, message: string, geoHint?: string) {
  return askWithHeaders(request, message, geoHint);
}

async function askWithHeaders(
  request: APIRequestContext,
  message: string,
  geoHint?: string,
  headers?: Record<string, string>
) {
  let payload: any = null;
  let ok = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.post("/api/ai-assistant/query", {
      headers,
      data: {
        message,
        geo_hint: geoHint
      }
    });
    payload = await response.json();
    if (response.ok() && payload?.llm_connected === true) {
      ok = true;
      break;
    }
    if (payload?.error?.code !== "NO_LLM" && payload?.error?.code !== "LLM_GENERATE_FAILED") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  expect(ok).toBeTruthy();
  expect(payload.ok).toBe(true);
  expect(payload.llm_connected).toBe(true);
  const answer = String(payload.answer || "").trim();
  expect(answer.length).toBeGreaterThan(20);
  for (const pattern of FORBIDDEN_PATTERNS) {
    expect(answer).not.toMatch(pattern);
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
  return answer;
}

test("culture chain stays alive across five turns", async ({ request }) => {
  const answers = [
    await askWithHeaders(request, "What is 420? Keep it short.", "JM", { "x-ai-reset": "1" }),
    await ask(request, "what else?", "JM"),
    await ask(request, "and how is it tied to reggae culture? Keep it short.", "JM"),
    await ask(request, "what about Bob Marley? Keep it short.", "JM"),
    await ask(request, "and Jamaica? Keep it short.", "JM")
  ];

  expect(answers[1]).not.toBe(answers[0]);
  expect(answers[2].toLowerCase()).toContain("reggae");
  expect(answers[3].toLowerCase()).toContain("marley");
  expect(answers[4].toLowerCase()).toContain("jamaica");
});

test("legal and social chain for India keeps context instead of restarting", async ({ request }) => {
  const first = await askWithHeaders(request, "What about cannabis in India? Keep it short.", "IN", { "x-ai-reset": "1" });
  const second = await ask(request, "and in practice? Keep it short.", "IN");
  const third = await ask(request, "what else?", "IN");
  const fourth = await ask(request, "what about the medical side? Keep it short.", "IN");

  expect(first.toLowerCase()).toContain("india");
  expect(second).not.toBe(first);
  expect(third).not.toBe(second);
  expect(fourth.toLowerCase()).toMatch(/medical|patient|prescription/);
});

test("travel chain keeps airport context and deepens instead of repeating", async ({ request }) => {
  const first = await askWithHeaders(request, "Can I take weed through airport in UAE? Keep it short.", "AE", { "x-ai-reset": "1" });
  const second = await ask(request, "what else?", "AE");
  const third = await ask(request, "and which airport matters most? Keep it short.", "AE");

  expect(first.toLowerCase()).toMatch(/airport|dxb|uae|dubai/);
  expect(second).not.toBe(first);
  expect(third).not.toBe(second);
  expect(third.toLowerCase()).toMatch(/airport|dxb|dubai|border/);
});

test("casual bridge can switch into topic mode without collapsing", async ({ request }) => {
  const first = await askWithHeaders(request, "How are you?", undefined, { "x-ai-reset": "1" });
  const second = await ask(request, "Tell me about reggae. Keep it short.", "JM");
  const third = await ask(request, "what else?", "JM");
  const fourth = await ask(request, "and law in Jamaica? Keep it short.", "JM");

  expect(first.toLowerCase()).toMatch(/calm|all calm|спокойно|на связи/);
  expect(second.toLowerCase()).toContain("reggae");
  expect(third).not.toBe(second);
  expect(fourth.toLowerCase()).toMatch(/jamaica|illegal|legal|restricted|decriminal/);
});
