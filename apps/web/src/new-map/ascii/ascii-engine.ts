import { ASCII_BODY_SSOT, ASCII_JOINT_SSOT, type AsciiFacing, framesForFacing } from "./ascii-ssot";
import { type AsciiTrigger, type GeoContext } from "./geo-store";

export const SYMBOL_420 = "4:20" as const;
export const PROPS = { joint: "_", smoke: "~", leaf: "*", fire: "+", spark: ".", ember: "." } as const;

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
const PARTICLE_LIMIT = 30;
const PARTICLE_LIFE = 40;
const TARGET_FRAME_MS = 1000 / 30;

export const IDLE_FRAMES = ASCII_BODY_SSOT.idle.right;
export const WALK_FRAMES = ASCII_BODY_SSOT.walk.right;
export const EXIT_FRAMES = ASCII_BODY_SSOT.exit.right;
export const DANCE_FRAMES = ASCII_BODY_SSOT.dance.right;
export const SMOKE_FRAMES = [
  ...ASCII_JOINT_SSOT.carry.right,
  ...ASCII_JOINT_SSOT.lift.right,
  ...ASCII_JOINT_SSOT.near.right,
  ...ASCII_JOINT_SSOT.exhale.right,
  ...ASCII_JOINT_SSOT.drop.right
] as const;
export const EXHALE_FRAMES = ASCII_JOINT_SSOT.exhale.right;
export const HOLD_FRAMES = ASCII_JOINT_SSOT.carry.right;
export const PASS_RIGHT_FRAMES = ASCII_JOINT_SSOT.lift.right;
export const PASS_LEFT_FRAMES = ASCII_JOINT_SSOT.lift.left;

export type SmokeState = "idle" | "lift" | "near" | "inhale" | "exhale" | "drop";

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
  smokeState?: SmokeState;
  smokeTick?: number;
  targetOffsetX?: number;
  targetOffsetY?: number;
  isFallback?: boolean;
  facing?: AsciiFacing;
  effectState?: SmokeState | null;
};

type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  alpha: number;
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

function isBodyHiddenChar(char: string, prev: string, next: string) {
  const isSmoke = char === "~";
  const isJoint = char === "_" || char === "-" || char === "`";
  const isEmber = char === "." && (prev === "_" || prev === "-" || prev === "`" || next === "~" || prev === "~");
  return isSmoke || isJoint || isEmber;
}

export function stripJointVisuals(frame: string) {
  return frame
    .split("\n")
    .map((line) =>
      [...line]
        .map((char, index) => {
          const prev = index > 0 ? line[index - 1] : "";
          const next = index < line.length - 1 ? line[index + 1] : "";
          return isBodyHiddenChar(char, prev, next) ? " " : char;
        })
        .join("")
    )
    .join("\n");
}

type JointAnchor = {
  baseX: number;
  baseY: number;
  emberX: number;
  emberY: number;
  side: AsciiFacing;
};

function findJointAnchor(frame: string, facing: AsciiFacing, originX: number, originY: number): JointAnchor | null {
  const lines = frame.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const jointColumns: number[] = [];
    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const char = line[charIndex];
      const prev = charIndex > 0 ? line[charIndex - 1] : "";
      const next = charIndex < line.length - 1 ? line[charIndex + 1] : "";
      if (isBodyHiddenChar(char, prev, next)) jointColumns.push(charIndex);
    }
    if (!jointColumns.length) continue;
    const baseColumn = facing === "right" ? Math.min(...jointColumns) : Math.max(...jointColumns);
    const baseX = originX + baseColumn * CHAR_WIDTH;
    const baseY = originY + lineIndex * LINE_HEIGHT - LINE_HEIGHT + FONT_SIZE * 0.52;
    const emberX = facing === "right" ? baseX + 10 : baseX - 10;
    return { baseX, baseY, emberX, emberY: baseY, side: facing };
  }
  return null;
}

export function getJointAnchor(frame: string, facing: AsciiFacing, originX = 0, originY = 0) {
  return findJointAnchor(frame, facing, originX, originY);
}

function createParticlePool() {
  return Array.from({ length: PARTICLE_LIMIT }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    alpha: 0
  })) satisfies Particle[];
}

function updateParticles(particles: Particle[]) {
  for (const particle of particles) {
    if (!particle.active) continue;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= 1;
    particle.alpha *= 0.96;
    if (particle.life <= 0 || particle.alpha <= 0.02) {
      particle.active = false;
    }
  }
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
  const facing = actor.facing || "right";
  actor.state = state;
  actor.frameTick = 0;
  actor.frameIndex = 0;
  if (state === "smoke") {
    actor.smokeState = "idle";
    actor.smokeTick = 0;
    actor.effectState = null;
    actor.frames = [framesForFacing(ASCII_JOINT_SSOT.carry, facing)[0]];
    return;
  }
  actor.smokeState = undefined;
  actor.smokeTick = 0;
  actor.effectState = null;
  if (state === "dance" || state === "finale") {
    actor.frames = framesForFacing(ASCII_BODY_SSOT.dance, facing);
    return;
  }
  if (state === "enter" || state === "walk") {
    actor.frames = framesForFacing(ASCII_BODY_SSOT.walk, facing);
    return;
  }
  if (state === "exit") {
    actor.frames = framesForFacing(ASCII_BODY_SSOT.exit, facing);
    return;
  }
  if (state === "build") {
    actor.frames = actor.frames.length ? actor.frames : [PROPS.spark];
    return;
  }
  actor.frames =
    actor.role === "smoker"
      ? framesForFacing(ASCII_JOINT_SSOT.carry, facing)
      : framesForFacing(ASCII_BODY_SSOT.idle, facing);
}

function setSmokingFrame(actor: Actor, nextState: SmokeState, frame: string) {
  if (actor.smokeState !== nextState || actor.frames[0] !== frame || actor.frames.length !== 1) {
    actor.smokeState = nextState;
    actor.frames = [frame];
    actor.frameIndex = 0;
    actor.frameTick = 0;
  }
}

function updateSmoking(actor: Actor) {
  const facing = actor.facing || "right";
  const carryFrames = framesForFacing(ASCII_JOINT_SSOT.carry, facing);
  const liftFrames = framesForFacing(ASCII_JOINT_SSOT.lift, facing);
  const nearFrames = framesForFacing(ASCII_JOINT_SSOT.near, facing);
  const exhaleFrames = framesForFacing(ASCII_JOINT_SSOT.exhale, facing);
  const dropFrames = framesForFacing(ASCII_JOINT_SSOT.drop, facing);
  const nextTick = (actor.smokeTick ?? 0) + 1;
  actor.smokeTick = nextTick;

  if (nextTick <= 60) {
    setSmokingFrame(actor, "idle", carryFrames[0]);
    return;
  }
  if (nextTick <= 100) {
    setSmokingFrame(actor, "lift", liftFrames[0]);
    return;
  }
  if (nextTick <= 140) {
    setSmokingFrame(actor, "near", liftFrames[Math.min(2, liftFrames.length - 1)]);
    return;
  }
  if (nextTick <= 200) {
    setSmokingFrame(actor, "inhale", nearFrames[0]);
    return;
  }
  if (nextTick <= 260) {
    setSmokingFrame(actor, "exhale", exhaleFrames[0]);
    return;
  }
  if (nextTick <= 320) {
    setSmokingFrame(actor, "drop", dropFrames[0]);
    return;
  }

  actor.smokeTick = 0;
  setSmokingFrame(actor, "idle", carryFrames[0]);
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
      updateSmoking(actor);
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
  private lastPaintTs = 0;
  private readonly particles = createParticlePool();
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
    this.lastPaintTs = 0;
    for (const particle of this.particles) particle.active = false;
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
      isFallback: actor.isFallback ?? false,
      effectState: actor.effectState ?? null
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
      const facing: AsciiFacing = index % 2 === 0 ? "right" : "left";
      const frames =
        role === "smoker"
          ? framesForFacing(ASCII_JOINT_SSOT.carry, facing)
          : framesForFacing(ASCII_BODY_SSOT.walk, facing);
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
        facing,
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
      facing: "right",
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

  private spawnSmoke(x: number, y: number, side: AsciiFacing, count = 1) {
    let remaining = count;
    for (const particle of this.particles) {
      if (remaining <= 0) break;
      if (particle.active) continue;
      const drift = count > 1 ? remaining - 1 : 0;
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = (side === "right" ? 0.24 : -0.24) + (drift - count / 2) * 0.05;
      particle.vy = -0.22 - Math.abs(drift) * 0.03;
      particle.life = PARTICLE_LIFE;
      particle.alpha = 1;
      remaining -= 1;
    }
  }

  private maybeEmitSmoke(actor: Actor, anchor: JointAnchor) {
    const smokeState = actor.smokeState;
    if (!smokeState) return;
    const stateChanged = actor.effectState !== smokeState;
    actor.effectState = smokeState;
    if (smokeState === "lift" && actor.smokeTick && actor.smokeTick % 24 === 0) {
      this.spawnSmoke(anchor.emberX, anchor.emberY, anchor.side, 1);
    }
    if (smokeState === "near" && actor.smokeTick && actor.smokeTick % 10 === 0) {
      this.spawnSmoke(anchor.emberX, anchor.emberY, anchor.side, 1);
    }
    if (smokeState === "inhale" && actor.smokeTick && actor.smokeTick % 18 === 0) {
      this.spawnSmoke(anchor.emberX, anchor.emberY, anchor.side, 1);
    }
    if (smokeState === "exhale") {
      if (stateChanged) {
        this.spawnSmoke(anchor.emberX, anchor.emberY, anchor.side, 5);
      } else if (actor.smokeTick && actor.smokeTick % 8 === 0) {
        this.spawnSmoke(anchor.emberX, anchor.emberY, anchor.side, 2);
      }
    }
  }

  private renderJoint(ctx: CanvasRenderingContext2D, actor: Actor, anchor: JointAnchor) {
    const lineEndX = anchor.side === "right" ? anchor.baseX + 10 : anchor.baseX - 10;
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(anchor.baseX, anchor.baseY);
    ctx.lineTo(lineEndX, anchor.baseY);
    ctx.strokeStyle = "#d9ddd6";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(anchor.emberX, anchor.emberY, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#d93b31";
    ctx.shadowColor = "rgba(235, 84, 52, 0.7)";
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
    this.maybeEmitSmoke(actor, anchor);
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.fillStyle = "#748595";
    for (const particle of this.particles) {
      if (!particle.active) continue;
      ctx.globalAlpha = particle.alpha;
      ctx.fillText("~", particle.x, particle.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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
      const bodyFrame = stripJointVisuals(frame);
      const { lines } = frameMetrics(bodyFrame);
      const projected = this.projectActor(actor);
      const jointAnchor =
        actor.role === "smoker" ? findJointAnchor(frame, actor.facing || "right", projected.x, projected.y) : null;
      ctx.globalAlpha = actor.state === "build" ? 0.94 : 0.98;
      lines.forEach((line, lineIndex) => {
        const drawY = projected.y + lineIndex * LINE_HEIGHT - LINE_HEIGHT;
        [...line].forEach((char, charIndex) => {
          const drawX = projected.x + charIndex * CHAR_WIDTH;
          ctx.strokeStyle = "rgba(238, 245, 248, 0.82)";
          ctx.fillStyle = "#1e3141";
          ctx.strokeText(char, drawX, drawY);
          ctx.fillText(char, drawX, drawY);
        });
      });
      if (jointAnchor) {
        this.renderJoint(ctx, actor, jointAnchor);
      }
    }
    this.renderParticles(ctx);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  private tick = (ts = 0) => {
    if (!this.running) return;
    if (this.lastPaintTs && ts - this.lastPaintTs < TARGET_FRAME_MS) {
      this.rafId = window.requestAnimationFrame(this.tick);
      return;
    }
    this.lastPaintTs = ts;
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
    updateParticles(this.particles);
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
