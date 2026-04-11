import { type AsciiTrigger, type GeoContext } from "./geo-store";

export const SYMBOL_420 = "4:20" as const;
export const PROPS = { joint: "=", smoke: "~", leaf: "*", fire: "+", spark: "." } as const;

const SAFE_ZONE = { top: 140, left: 20, right: 20, bottom: 128 } as const;
const FONT_SIZE = 21;
const LINE_HEIGHT = 19;
const CHAR_WIDTH = 11.5;
const MAX_ACTORS = 20;
const FRAME_INTERVAL = 8;
const TARGET_REACH = 1.6;
const OFFSET_CLAMP_X = 120;
const RENDER_OFFSET_Y = -20;
const FALLBACK_RENDER_Y_FACTOR = 0.85;
const ANTARCTICA_CENTER = { lng: 0, lat: -77 } as const;
const FALLBACK_ACTOR_TTL = 9999;

export const IDLE_FRAMES = ["  o  \n /|   \n / \\", "  o  \n /|   \n / \\\n  ~"] as const;
export const WALK_FRAMES = [
  "  o  \n /|--=\n / \\",
  "  o  \n /|--=\n /| ",
  "  o  \n /|--=\n  |\\",
  "  o  \n /|--=\n / \\"
] as const;
export const EXIT_FRAMES = ["  o  \n /|--=\n  |\\", "  o  \n /|--=\n /| "] as const;
export const DANCE_FRAMES = [
  "  o  \n \\|/  \n / \\",
  "  o  \n /|\\  \n  | ",
  "  o  \n \\|/  \n / \\"
] as const;
export const SMOKE_FRAMES = [
  "  o  \n /|--=\n / \\",
  "  o  \n /|--=\n / \\\n  ~",
  "  o  \n /|--=\n / \\\n ~~~"
] as const;
export const EXHALE_FRAMES = [
  "  o  \n /|--=\n / \\\n ~~~",
  "  o  \n /|--=\n / \\\n  ~~",
  "  o  \n /|--=\n / \\\n   ~"
] as const;
export const HOLD_FRAMES = ["  o   \n /|   \n / \\"] as const;
export const PASS_RIGHT_FRAMES = ["  o   \n /|--=\n / \\"] as const;

export type ActorState = "enter" | "walk" | "idle" | "smoke" | "interact" | "build" | "dance" | "finale" | "exit";
export type ActorRole = "walker" | "smoker" | "token";
export type Actor = {
  anchorLng: number;
  anchorLat: number;
  offsetX: number;
  offsetY: number;
  vx: number;
  vy: number;
  frames: string[];
  frameIndex: number;
  frameTick: number;
  state: ActorState;
  ttl: number;
  t: number;
  role: ActorRole;
  targetOffsetX?: number;
  targetOffsetY?: number;
  isFallback?: boolean;
};

export type ScenarioDef = {
  id: string;
  duration: number;
  weight: number;
  allowedTriggers: AsciiTrigger[];
  start: (_engine: AsciiEngine) => void;
  update: (_engine: AsciiEngine, _t: number) => void;
};

export type PhraseToken = string | { text: string; dy?: number; dx?: number };

function pickWeighted(registry: ScenarioDef[], trigger: AsciiTrigger, cursor: number, recentIds: string[]) {
  const pool = registry.filter((scenario) => scenario.allowedTriggers.includes(trigger));
  if (trigger === "auto") {
    if (!pool.length) return null;
    for (let index = 0; index < pool.length; index += 1) {
      const candidate = pool[(cursor + index) % pool.length];
      if (pool.length <= recentIds.length || !recentIds.includes(candidate.id)) return candidate;
    }
    return pool[cursor % pool.length] || null;
  }
  const filteredPool =
    pool.length > recentIds.length
      ? pool.filter((scenario) => !recentIds.includes(scenario.id))
      : pool;
  const totalWeight = filteredPool.reduce((sum, scenario) => sum + scenario.weight, 0);
  if (!filteredPool.length || totalWeight <= 0) return null;
  let slot = cursor % totalWeight;
  for (const scenario of filteredPool) {
    slot -= scenario.weight;
    if (slot < 0) return scenario;
  }
  return filteredPool[0] || null;
}

function frameMetrics(frame: string) {
  const lines = frame.split("\n");
  const width = Math.max(...lines.map((line) => line.length), 1) * CHAR_WIDTH;
  const height = lines.length * LINE_HEIGHT;
  return { lines, width, height };
}

function clampToSafeZone(engine: AsciiEngine, x: number, y: number, width: number, height: number) {
  const minX = SAFE_ZONE.left;
  const maxX = Math.max(minX, engine.width - SAFE_ZONE.right - width);
  const minY = SAFE_ZONE.top + height * 0.5;
  const maxY = Math.max(minY, engine.height - SAFE_ZONE.bottom - height * 0.5);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y))
  };
}

function clampOffset(actor: Actor) {
  actor.offsetX = Math.max(-OFFSET_CLAMP_X, Math.min(OFFSET_CLAMP_X, actor.offsetX));
  actor.offsetY = Math.max(-20, Math.min(10, actor.offsetY));
}

function assignFrames(actor: Actor, state: ActorState) {
  actor.state = state;
  actor.frameTick = 0;
  actor.frameIndex = 0;
  if (state === "smoke") {
    actor.frames = [...SMOKE_FRAMES];
    return;
  }
  if (state === "dance" || state === "finale") {
    actor.frames = [...DANCE_FRAMES];
    return;
  }
  if (state === "enter" || state === "walk") {
    actor.frames = [...WALK_FRAMES];
    return;
  }
  if (state === "exit") {
    actor.frames = [...EXIT_FRAMES];
    return;
  }
  if (state === "build") {
    actor.frames = actor.frames.length ? actor.frames : [PROPS.spark];
    return;
  }
  actor.frames = actor.role === "smoker" ? [...SMOKE_FRAMES] : [...IDLE_FRAMES];
}

function syncFrame(actor: Actor) {
  actor.frameTick += 1;
  if (actor.frames.length > 1 && actor.frameTick > FRAME_INTERVAL) {
    actor.frameTick = 0;
    actor.frameIndex = (actor.frameIndex + 1) % actor.frames.length;
  }
}

function moveTowards(actor: Actor, targetX: number, targetY: number, speed = 0.18) {
  actor.offsetX += (targetX - actor.offsetX) * speed;
  actor.offsetY += (targetY - actor.offsetY) * speed;
  clampOffset(actor);
  return Math.abs(targetX - actor.offsetX) < TARGET_REACH && Math.abs(targetY - actor.offsetY) < TARGET_REACH;
}

function updateActor(actor: Actor, t: number, engine: AsciiEngine) {
  actor.t += 1;
  actor.ttl -= 1;
  syncFrame(actor);

  const currentFrame = actor.frames[actor.frameIndex] || actor.frames[0] || "";
  const metrics = frameMetrics(currentFrame);

  switch (actor.state) {
    case "enter":
    case "walk":
      if (typeof actor.targetOffsetX === "number" && typeof actor.targetOffsetY === "number") {
        const settled = moveTowards(
          actor,
          actor.targetOffsetX,
          actor.targetOffsetY,
          actor.state === "enter" ? 0.16 : 0.12
        );
        if (settled && actor.state === "enter") assignFrames(actor, "idle");
      } else {
        actor.offsetX += actor.vx;
      }
      break;
    case "idle":
      actor.offsetY += Math.sin((t + actor.t) * 0.05) * 0.18;
      break;
    case "smoke":
      actor.offsetY += Math.cos((t + actor.t) * 0.03) * 0.12;
      break;
    case "dance":
      actor.offsetX += Math.sin((t + actor.t) * 0.08) * 0.85;
      actor.offsetY += Math.cos((t + actor.t) * 0.11) * 0.5;
      break;
    case "build":
      if (typeof actor.targetOffsetX === "number" && typeof actor.targetOffsetY === "number") {
        moveTowards(actor, actor.targetOffsetX, actor.targetOffsetY, 0.2);
      }
      break;
    case "finale":
      actor.offsetY -= 0.28;
      actor.offsetX += Math.sin((t + actor.t) * 0.09) * 0.5;
      break;
    case "exit":
      actor.offsetX += actor.vx;
      actor.offsetY += actor.vy;
      break;
    default:
      break;
  }

  clampOffset(actor);
  const projection = engine.projectActor(actor);
  const clamped = clampToSafeZone(engine, projection.x, projection.y, metrics.width, metrics.height);
  actor.offsetX += clamped.x - projection.x;
  actor.offsetY += clamped.y - projection.y;
  clampOffset(actor);
}

export class AsciiEngine {
  actors: Actor[] = [];
  frame = 0;
  running = false;
  width = 0;
  height = 0;
  scenario: ScenarioDef | null = null;
  scenarioT = 0;
  pickCursor = 0;
  autoTriggerEnabled = false;
  idleFrames = 0;
  recentScenarioIds: string[] = [];
  private rafId = 0;
  private dpr = 1;
  private readonly canvas: HTMLCanvasElement;
  private readonly registry: ScenarioDef[];
  private readonly readGeo: () => GeoContext;

  constructor(canvas: HTMLCanvasElement, registry: ScenarioDef[], readGeo: () => GeoContext) {
    this.canvas = canvas;
    this.registry = registry;
    this.readGeo = readGeo;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    if (!this.autoTriggerEnabled) this.ensureFallbackActor();
    for (const actor of this.actors) updateActor(actor, this.frame, this);
    this.render();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    window.cancelAnimationFrame(this.rafId);
    this.actors = [];
    this.scenario = null;
    this.scenarioT = 0;
    this.render();
  }

  trigger(trigger: AsciiTrigger) {
    const scenario = pickWeighted(this.registry, trigger, this.pickCursor++, this.recentScenarioIds);
    if (!scenario) return;
    this.autoTriggerEnabled = trigger === "auto";
    this.idleFrames = 0;
    this.recentScenarioIds = [scenario.id, ...this.recentScenarioIds.filter((id) => id !== scenario.id)].slice(0, 3);
    this.actors = [];
    this.scenario = scenario;
    this.scenarioT = 0;
    this.canvas.dataset.asciiScenario = scenario.id;
    scenario.start(this);
    if (this.actors.length === 0) this.ensureFallbackActor();
    for (const actor of this.actors) updateActor(actor, this.frame, this);
    this.render();
  }

  spawnActor(actor: Omit<Actor, "t" | "frameIndex" | "frameTick"> & { t?: number }) {
    if (this.actors.length >= MAX_ACTORS) this.actors.shift();
    this.actors.push({
      ...actor,
      t: actor.t ?? 0,
      frameIndex: 0,
      frameTick: 0,
      isFallback: actor.isFallback ?? false
    });
  }

  getAnchor() {
    const projected = this.projectLngLat(ANTARCTICA_CENTER.lng, ANTARCTICA_CENTER.lat);
    return clampToSafeZone(this, projected.x, projected.y, 120, 64);
  }

  private getFallbackProjection() {
    return {
      x: this.width * 0.5,
      y: this.height * FALLBACK_RENDER_Y_FACTOR
    };
  }

  private projectLngLat(lng: number, lat: number) {
    const geo = this.readGeo();
    const fallback = this.getFallbackProjection();
    const viewportWidth = Number.isFinite(geo.viewportWidth) ? Number(geo.viewportWidth) : this.width;
    const viewportHeight = Number.isFinite(geo.viewportHeight) ? Number(geo.viewportHeight) : this.height;
    const anchorX = Number.isFinite(geo.anchorX) ? Number(geo.anchorX) : fallback.x;
    const anchorY = Number.isFinite(geo.anchorY) ? Number(geo.anchorY) : fallback.y;
    const scaleX = viewportWidth ? this.width / viewportWidth : 1;
    const scaleY = viewportHeight ? this.height / viewportHeight : 1;
    const lngFactor = Math.cos((lat * Math.PI) / 180);
    const deltaX = ((lng - 0) / 180) * (viewportWidth * 0.35) * lngFactor;
    const deltaY = ((lat + 77) / 14) * (viewportHeight * 0.26);
    const projected = {
      x: anchorX * scaleX + deltaX * scaleX,
      y: anchorY * scaleY + deltaY * scaleY + RENDER_OFFSET_Y
    };
    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      return this.getFallbackProjection();
    }
    return projected;
  }

  projectActor(actor: Actor) {
    const anchor = this.projectLngLat(actor.anchorLng, actor.anchorLat);
    return {
      x: anchor.x + actor.offsetX,
      y: anchor.y + actor.offsetY
    };
  }

  spawnGroup(count: number, yOffset = 0) {
    const spacing = 26;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 3);
      const column = index % 3;
      const targetOffsetX = -60 + column * 48 + (index % 2 === 0 ? -10 : 10);
      const targetOffsetY = -20 + row * spacing + yOffset + (index % 2 === 0 ? -6 : 6);
      const role: ActorRole = index % 3 === 1 ? "smoker" : "walker";
      const frames = role === "smoker" ? [...SMOKE_FRAMES] : [...WALK_FRAMES];
      this.spawnActor({
        anchorLng: ANTARCTICA_CENTER.lng,
        anchorLat: ANTARCTICA_CENTER.lat,
        offsetX: targetOffsetX - 96 - column * 18,
        offsetY: targetOffsetY,
        vx: 1.1,
        vy: 0,
        frames,
        state: "enter",
        ttl: 840,
        role,
        targetOffsetX,
        targetOffsetY
      });
    }
  }

  formPhrase(tokens: readonly PhraseToken[], yOffset = -96) {
    const gap = 42;
    const startOffsetX = -((tokens.length - 1) * gap) / 2;
    while (this.actors.length < tokens.length) {
      this.spawnActor({
        anchorLng: ANTARCTICA_CENTER.lng,
        anchorLat: ANTARCTICA_CENTER.lat,
        offsetX: 0,
        offsetY: 0,
        vx: 0,
        vy: 0,
        frames: [PROPS.spark],
        state: "build",
        ttl: 260,
        role: "token"
      });
    }
    tokens.forEach((token, index) => {
      const actor = this.actors[index];
      if (!actor) return;
      const resolved = typeof token === "string" ? { text: token, dy: 0, dx: 0 } : token;
      actor.anchorLng = ANTARCTICA_CENTER.lng;
      actor.anchorLat = ANTARCTICA_CENTER.lat;
      actor.role = "token";
      actor.frames = [resolved.text];
      actor.frameIndex = 0;
      actor.frameTick = 0;
      actor.targetOffsetX = startOffsetX + index * gap + (resolved.dx ?? 0);
      actor.targetOffsetY = yOffset + (resolved.dy ?? 0);
      actor.ttl = Math.max(actor.ttl, 220);
      assignFrames(actor, "build");
    });
  }

  ensureFallbackActor() {
    if (this.actors.length > 0) return;
    this.spawnActor({
      anchorLng: ANTARCTICA_CENTER.lng,
      anchorLat: ANTARCTICA_CENTER.lat,
      offsetX: 0,
      offsetY: 0,
      vx: 0,
      vy: 0,
      frames: ["  o_o"],
      state: "idle",
      ttl: FALLBACK_ACTOR_TTL,
      role: "walker",
      isFallback: true
    });
  }

  setStateAll(state: ActorState) {
    this.actors.forEach((actor) => {
      if (actor.role === "token" && state !== "build") {
        actor.role = "walker";
      }
      assignFrames(actor, state);
    });
  }

  setActorState(index: number, state: ActorState) {
    const actor = this.actors[index];
    if (!actor) return;
    if (actor.role === "token" && state !== "build") {
      actor.role = "walker";
    }
    assignFrames(actor, state);
  }

  finale() {
    this.actors.forEach((actor, index) => {
      if (actor.role === "token") {
        actor.role = "walker";
      }
      actor.vx = 0.6 + (index % 3) * 0.18;
      actor.vy = -0.18 - (index % 2) * 0.08;
      actor.targetOffsetX = undefined;
      actor.targetOffsetY = undefined;
      actor.ttl = Math.max(actor.ttl, 120);
      assignFrames(actor, "exit");
    });
  }

  private resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(bounds.width));
    this.height = Math.max(1, Math.round(bounds.height));
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  private render() {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.font = `700 ${FONT_SIZE}px 'IBM Plex Mono', 'SFMono-Regular', monospace`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(238, 245, 248, 0.82)";
    ctx.fillStyle = "#1e3141";
    ctx.shadowColor = "rgba(255, 255, 255, 0.45)";
    ctx.shadowBlur = 8;
    for (const actor of this.actors) {
      const frame = actor.frames[actor.frameIndex] || actor.frames[0] || "";
      const { lines } = frameMetrics(frame);
      const projected = this.projectActor(actor);
      ctx.globalAlpha = actor.state === "build" ? 0.94 : 0.98;
      lines.forEach((line, lineIndex) => {
        const drawY = projected.y + lineIndex * LINE_HEIGHT - LINE_HEIGHT;
        ctx.strokeText(line, projected.x, drawY);
        ctx.fillText(line, projected.x, drawY);
      });
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private tick = () => {
    if (!this.running) return;
    this.frame += 1;
    if (this.frame % 24 === 1) this.resize();

    if (this.scenario) {
      this.scenario.update(this, this.scenarioT);
      this.scenarioT += 1;
      if (this.scenarioT >= this.scenario.duration) {
        this.finale();
        this.scenario = null;
        this.scenarioT = 0;
        this.canvas.dataset.asciiScenario = "cooldown";
      }
    }

    for (const actor of this.actors) updateActor(actor, this.frame, this);
    this.actors = this.actors.filter((actor) => actor.ttl > 0);
    if (this.autoTriggerEnabled && !this.scenario) {
      const hasLiveActors = this.actors.some(
        (actor) => !actor.isFallback
      );
      if (hasLiveActors) {
        this.idleFrames = 0;
      } else {
        this.idleFrames += 1;
        if (this.idleFrames >= 48) {
          this.trigger("auto");
        }
      }
    } else {
      this.idleFrames = 0;
    }
    if (!this.autoTriggerEnabled && this.actors.length === 0) {
      this.ensureFallbackActor();
    }
    this.render();
    this.rafId = window.requestAnimationFrame(this.tick);
  };
}
