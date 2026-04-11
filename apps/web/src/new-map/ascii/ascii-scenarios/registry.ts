import {
  type Actor,
  DANCE_FRAMES,
  EXHALE_FRAMES,
  HOLD_FRAMES,
  IDLE_FRAMES,
  PASS_RIGHT_FRAMES,
  PROPS,
  SMOKE_FRAMES,
  SYMBOL_420,
  type ScenarioDef,
  WALK_FRAMES
} from "../ascii-engine";

const AUTO = ["auto"] as const;
const CENTER = { lng: 0, lat: -77 } as const;

function addActor(
  engine: {
    spawnActor: (_actor: Omit<Actor, "t" | "frameIndex" | "frameTick"> & { t?: number }) => void;
  },
  {
    x,
    y,
    role = "walker",
    state = "idle",
    ttl = 840,
    vx = 0,
    vy = 0,
    frames,
    tx,
    ty
  }: {
    x: number;
    y: number;
    role?: Actor["role"];
    state?: Actor["state"];
    ttl?: number;
    vx?: number;
    vy?: number;
    frames?: string[];
    tx?: number;
    ty?: number;
  }
) {
  engine.spawnActor({
    anchorLng: CENTER.lng,
    anchorLat: CENTER.lat,
    offsetX: x,
    offsetY: y,
    vx,
    vy,
    frames: frames || [...IDLE_FRAMES],
    state,
    ttl,
    role,
    targetOffsetX: tx,
    targetOffsetY: ty
  });
}

function spawnLine(
  engine: Parameters<ScenarioDef["start"]>[0],
  count: number,
  startX: number,
  gap: number,
  y: number,
  role: Actor["role"] = "walker"
) {
  for (let index = 0; index < count; index += 1) {
    addActor(engine, {
      x: startX + index * gap,
      y,
      tx: startX + index * gap,
      ty: y,
      role,
      state: "enter",
      frames: role === "smoker" ? [...SMOKE_FRAMES] : [...WALK_FRAMES]
    });
  }
}

function spawnCircle(engine: Parameters<ScenarioDef["start"]>[0], count: number, radius: number, centerY = -8) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const tx = Math.cos(angle) * radius;
    const ty = centerY + Math.sin(angle) * Math.max(12, radius * 0.4);
    addActor(engine, {
      x: tx * 1.7,
      y: ty + (index % 2 === 0 ? -10 : 10),
      tx,
      ty,
      role: index % 2 === 0 ? "smoker" : "walker",
      state: "enter",
      frames: index % 2 === 0 ? [...SMOKE_FRAMES] : [...WALK_FRAMES]
    });
  }
}

function scatterActors(engine: Parameters<ScenarioDef["start"]>[0], count: number, spreadX: number, spreadY: number) {
  for (let index = 0; index < count; index += 1) {
    const tx = -spreadX + (index % 4) * ((spreadX * 2) / 3) - (index % 2 === 0 ? 8 : -8);
    const ty = -spreadY + Math.floor(index / 4) * 18 + (index % 2 === 0 ? -4 : 4);
    addActor(engine, {
      x: tx + (index % 3 - 1) * 36,
      y: ty + 24,
      tx,
      ty,
      role: index % 3 === 0 ? "smoker" : "walker",
      state: "enter",
      frames: index % 3 === 0 ? [...SMOKE_FRAMES] : [...WALK_FRAMES]
    });
  }
}

function setFrames(actor: Actor | undefined, frames: readonly string[]) {
  if (!actor) return;
  actor.frames = [...frames];
  actor.frameIndex = 0;
  actor.frameTick = 0;
}

function symbol420Tokens() {
  return SYMBOL_420.split("").map((text) => (text === ":" ? { text, dy: -5 } : text));
}

function setTargets(
  engine: Parameters<ScenarioDef["start"]>[0],
  targets: Array<{ x: number; y: number; state?: Actor["state"]; vx?: number; vy?: number }>
) {
  engine.actors.forEach((actor, index) => {
    const target = targets[index % targets.length];
    actor.targetOffsetX = target.x;
    actor.targetOffsetY = target.y;
    if (typeof target.vx === "number") actor.vx = target.vx;
    if (typeof target.vy === "number") actor.vy = target.vy;
    if (target.state) engine.setActorState(index, target.state);
  });
}

function shiftTargets(engine: Parameters<ScenarioDef["start"]>[0], dx: number, dy = 0, state: Actor["state"] = "walk") {
  engine.actors.forEach((actor, index) => {
    actor.targetOffsetX = (actor.targetOffsetX ?? actor.offsetX) + dx;
    actor.targetOffsetY = (actor.targetOffsetY ?? actor.offsetY) + dy;
    engine.setActorState(index, state);
  });
}

function makeWave(engine: Parameters<ScenarioDef["start"]>[0], amplitude = 18, y = -12) {
  engine.actors.forEach((actor, index) => {
    actor.targetOffsetX = -84 + index * 28;
    actor.targetOffsetY = y + Math.sin(index * 0.9) * amplitude;
    engine.setActorState(index, "dance");
  });
}

function setOrbit(engine: Parameters<ScenarioDef["start"]>[0], radius = 42, centerY = -10) {
  engine.actors.forEach((actor, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(engine.actors.length, 1);
    actor.targetOffsetX = Math.cos(angle) * radius;
    actor.targetOffsetY = centerY + Math.sin(angle) * radius * 0.45;
    engine.setActorState(index, "walk");
  });
}

function burst(engine: Parameters<ScenarioDef["start"]>[0], speed = 1.3) {
  engine.actors.forEach((actor, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(engine.actors.length, 1);
    actor.vx = Math.cos(angle) * speed;
    actor.vy = Math.sin(angle) * speed * 0.42 - 0.12;
    actor.targetOffsetX = undefined;
    actor.targetOffsetY = undefined;
    engine.setActorState(index, "exit");
  });
}

function setGlitch(engine: Parameters<ScenarioDef["start"]>[0], intensity = 1) {
  engine.actors.forEach((actor, index) => {
    actor.frames = index % 2 === 0
      ? [" o_\n/|\\\n/ \\", " o \n/|_\n/ \\", "_o \n/|\\\n/ _"]
      : ["  o-o", "  o_o", "  o~o"];
    actor.frameIndex = 0;
    actor.frameTick = 0;
    actor.offsetX += (index % 2 === 0 ? -1 : 1) * intensity * 8;
    actor.offsetY += (index % 3 - 1) * intensity * 2;
    actor.state = "idle";
  });
}

function phased(
  id: string,
  duration: number,
  start: ScenarioDef["start"],
  events: Array<[number, (_engine: Parameters<ScenarioDef["start"]>[0]) => void]>,
  weight = 1
): ScenarioDef {
  return {
    id,
    duration,
    weight,
    allowedTriggers: [...AUTO],
    start,
    update(engine, t) {
      for (const [tick, action] of events) {
        if (t === tick) action(engine);
      }
    }
  };
}

const scenarioMeetWalk = phased(
  "meet-walk",
  720,
  (engine) => {
    addActor(engine, { x: -150, y: -8, tx: -36, ty: -8, state: "enter" });
    addActor(engine, { x: 150, y: -6, tx: 36, ty: -6, state: "enter", vx: -1.1 });
  },
  [
    [90, (engine) => setTargets(engine, [{ x: -8, y: -8, state: "walk" }, { x: 8, y: -8, state: "walk" }])],
    [180, (engine) => setTargets(engine, [{ x: 8, y: -8, state: "idle" }, { x: 28, y: -8, state: "idle" }])],
    [260, (engine) => shiftTargets(engine, 84, 0, "walk")],
    [430, (engine) => shiftTargets(engine, 70, 0, "exit")]
  ]
);

const scenarioWalkingSmoker: ScenarioDef = {
  id: "walking-smoker",
  duration: 720,
  weight: 2,
  allowedTriggers: [...AUTO],
  start(engine) {
    addActor(engine, {
      x: -136,
      y: -8,
      role: "smoker",
      state: "walk",
      vx: 0.8,
      frames: [...WALK_FRAMES]
    });
    const actor = engine.actors[0];
    if (actor) {
      actor.targetOffsetX = undefined;
      actor.targetOffsetY = undefined;
    }
  },
  update(engine, t) {
    const actor = engine.actors[0];
    if (!actor) return;
    if (t < 120) {
      setFrames(actor, WALK_FRAMES);
      actor.state = "walk";
      actor.offsetX += 0.45;
      return;
    }
    if (t < 320) {
      actor.state = "walk";
      actor.offsetX += 0.3;
      if (t % 80 < 48) setFrames(actor, SMOKE_FRAMES);
      else setFrames(actor, WALK_FRAMES);
      return;
    }
    if (t < 430) {
      actor.state = "smoke";
      setFrames(actor, EXHALE_FRAMES);
      return;
    }
    setFrames(actor, WALK_FRAMES);
    actor.state = "exit";
    actor.offsetX += 0.65;
    if (actor.offsetX > 150) engine.actors = [];
  }
};

const scenarioPassJoint: ScenarioDef = {
  id: "pass-joint",
  duration: 760,
  weight: 2,
  allowedTriggers: [...AUTO],
  start(engine) {
    for (let index = 0; index < 3; index += 1) {
      addActor(engine, {
        x: -44 + index * 44,
        y: -8,
        tx: -44 + index * 44,
        ty: -8,
        role: "smoker",
        state: "idle",
        frames: [...HOLD_FRAMES]
      });
    }
  },
  update(engine, t) {
    const [actorA, actorB, actorC] = engine.actors;
    if (!actorA || !actorB || !actorC) return;
    if (t < 90) {
      setFrames(actorA, HOLD_FRAMES);
      setFrames(actorB, HOLD_FRAMES);
      setFrames(actorC, HOLD_FRAMES);
      return;
    }
    if (t < 220) {
      setFrames(actorA, SMOKE_FRAMES);
      setFrames(actorB, HOLD_FRAMES);
      setFrames(actorC, HOLD_FRAMES);
      return;
    }
    if (t < 320) {
      setFrames(actorA, PASS_RIGHT_FRAMES);
      setFrames(actorB, PASS_RIGHT_FRAMES);
      setFrames(actorC, HOLD_FRAMES);
      actorA.offsetX += 0.1;
      actorB.offsetX -= 0.05;
      return;
    }
    if (t < 470) {
      setFrames(actorA, HOLD_FRAMES);
      setFrames(actorB, SMOKE_FRAMES);
      setFrames(actorC, HOLD_FRAMES);
      return;
    }
    if (t < 610) {
      setFrames(actorA, HOLD_FRAMES);
      setFrames(actorB, PASS_RIGHT_FRAMES);
      setFrames(actorC, SMOKE_FRAMES);
      actorC.offsetX -= 0.03;
      return;
    }
    setFrames(actorA, HOLD_FRAMES);
    setFrames(actorB, HOLD_FRAMES);
    setFrames(actorC, EXHALE_FRAMES);
    if (t > 700) engine.actors = [];
  }
};

const scenarioCircleSmoke: ScenarioDef = {
  id: "circle-smoke",
  duration: 760,
  weight: 2,
  allowedTriggers: [...AUTO],
  start(engine) {
    spawnCircle(engine, 6, 56, -14);
  },
  update(engine, t) {
    if (t < 90) return;
    if (t < 220) {
      engine.actors.forEach((actor, index) => {
        const angle = (index / Math.max(engine.actors.length, 1)) * Math.PI * 2;
        actor.targetOffsetX = Math.cos(angle) * 60;
        actor.targetOffsetY = -10 + Math.sin(angle) * 26;
        engine.setActorState(index, "walk");
      });
      return;
    }
    if (t < 380) {
      engine.actors.forEach((actor) => setFrames(actor, SMOKE_FRAMES));
      return;
    }
    if (t < 520) {
      engine.actors.forEach((actor, index) => {
        setFrames(actor, EXHALE_FRAMES);
        actor.offsetY -= index % 2 === 0 ? 0.18 : 0.08;
      });
      return;
    }
    engine.actors = [];
  }
};

const scenarioDanceSmokers: ScenarioDef = {
  id: "dance-smokers",
  duration: 760,
  weight: 2,
  allowedTriggers: [...AUTO],
  start(engine) {
    scatterActors(engine, 5, 80, 26);
  },
  update(engine, t) {
    if (t < 100) return;
    if (t < 190) {
      engine.actors.forEach((actor) => {
        actor.offsetX += actor.offsetX < 0 ? 0.35 : -0.35;
        actor.offsetY += actor.offsetY < -6 ? 0.2 : -0.2;
        setFrames(actor, WALK_FRAMES);
      });
      return;
    }
    if (t < 280) {
      engine.actors.forEach((actor, index) => {
        actor.targetOffsetX = index * 24 - 48;
        actor.targetOffsetY = -8;
        engine.setActorState(index, "walk");
      });
      return;
    }
    if (t < 470) {
      engine.actors.forEach((actor) => setFrames(actor, DANCE_FRAMES));
      return;
    }
    if (t < 590) {
      engine.actors.forEach((actor) => setFrames(actor, SMOKE_FRAMES));
      return;
    }
    engine.actors = [];
  }
};

const scenarioChaosOrder = phased(
  "chaos-order",
  720,
  (engine) => scatterActors(engine, 6, 70, 24),
  [
    [60, (engine) => engine.actors.forEach((actor, index) => { actor.vx = index % 2 === 0 ? 1.4 : -1.2; actor.vy = index % 3 === 0 ? 0.22 : -0.16; engine.setActorState(index, "walk"); })],
    [220, (engine) => setTargets(engine, engine.actors.map((_, index) => ({ x: -72 + index * 28, y: -8, state: "walk" })))],
    [420, (engine) => engine.setStateAll("idle")],
    [560, (engine) => shiftTargets(engine, 88, 0, "exit")]
  ]
);

const scenarioBuild4_20: ScenarioDef = {
  id: "build-4-20",
  duration: 780,
  weight: 2,
  allowedTriggers: [...AUTO],
  start(engine) {
    scatterActors(engine, 8, 88, 34);
  },
  update(engine, t) {
    if (t < 100) return;
    if (t < 260) {
      engine.actors.forEach((actor, index) => {
        const layout = [
          { x: -60, y: -88 },
          { x: -40, y: -88 },
          { x: -20, y: -88 },
          { x: 0, y: -93 },
          { x: 20, y: -88 },
          { x: 40, y: -88 },
          { x: 60, y: -88 },
          { x: 80, y: -88 }
        ][index];
        actor.targetOffsetX = layout.x;
        actor.targetOffsetY = layout.y;
        engine.setActorState(index, "walk");
      });
      return;
    }
    if (t === 260) {
      engine.formPhrase(symbol420Tokens().map((token, index) => (
        typeof token === "string" ? token : { ...token, dx: index === 1 ? -20 : 0 }
      )), -88);
      return;
    }
    if (t < 440) {
      engine.setStateAll("build");
      return;
    }
    if (t < 560) {
      engine.actors.forEach((actor) => setFrames(actor, SMOKE_FRAMES));
      return;
    }
    burst(engine, 1.45);
  }
};

const scenarioSmokeTo4_20 = phased(
  "smoke-to-4-20",
  720,
  (engine) => spawnLine(engine, 2, -28, 56, -10, "smoker"),
  [
    [100, (engine) => engine.setStateAll("smoke")],
    [260, (engine) => engine.formPhrase([PROPS.smoke, ...symbol420Tokens(), PROPS.smoke], -96)],
    [480, (engine) => engine.setStateAll("dance")],
    [620, (engine) => engine.finale()]
  ]
);

const scenarioChase = phased(
  "chase",
  660,
  (engine) => {
    addActor(engine, { x: -96, y: -10, tx: 36, ty: -10, state: "enter" });
    addActor(engine, { x: -144, y: -6, tx: 8, ty: -6, state: "enter" });
  },
  [
    [120, (engine) => setTargets(engine, [{ x: 92, y: -12, state: "walk" }, { x: 48, y: -8, state: "walk" }])],
    [260, (engine) => setTargets(engine, [{ x: 48, y: -8, state: "idle" }, { x: 54, y: -8, state: "idle" }])],
    [380, (engine) => engine.setStateAll("dance")],
    [520, (engine) => burst(engine, 1.2)]
  ]
);

const scenarioWave = phased(
  "wave",
  720,
  (engine) => spawnLine(engine, 6, -90, 36, -10),
  [
    [90, (engine) => makeWave(engine, 20, -8)],
    [260, (engine) => makeWave(engine, 28, -12)],
    [420, (engine) => engine.setStateAll("dance")],
    [590, (engine) => burst(engine, 1.1)]
  ]
);

const scenarioSpiral = phased(
  "spiral",
  720,
  (engine) => spawnCircle(engine, 6, 64, -12),
  [
    [80, (engine) => setOrbit(engine, 54, -12)],
    [220, (engine) => setOrbit(engine, 36, -10)],
    [360, (engine) => setOrbit(engine, 18, -8)],
    [500, (engine) => engine.setStateAll("idle")],
    [620, (engine) => burst(engine, 1.15)]
  ]
);

const scenarioChainFollow = phased(
  "chain-follow",
  720,
  (engine) => spawnLine(engine, 5, -132, 30, -8),
  [
    [80, (engine) => setTargets(engine, [{ x: -70, y: -8, state: "walk" }, { x: -40, y: -8, state: "walk" }, { x: -10, y: -8, state: "walk" }, { x: 20, y: -8, state: "walk" }, { x: 50, y: -8, state: "walk" }])],
    [240, (engine) => setTargets(engine, [{ x: 22, y: -16, state: "walk" }, { x: -8, y: -10, state: "walk" }, { x: -38, y: -4, state: "walk" }, { x: -68, y: 2, state: "walk" }, { x: -98, y: 8, state: "walk" }])],
    [430, (engine) => engine.setStateAll("dance")],
    [580, (engine) => shiftTargets(engine, 84, 0, "exit")]
  ]
);

const scenarioGlitch = phased(
  "glitch",
  660,
  (engine) => spawnLine(engine, 4, -66, 44, -10),
  [
    [80, (engine) => engine.setStateAll("idle")],
    [180, (engine) => setGlitch(engine, 1)],
    [320, (engine) => setGlitch(engine, 2)],
    [460, (engine) => engine.setStateAll("dance")],
    [560, (engine) => engine.finale()]
  ]
);

const scenarioJumps = phased(
  "jumps",
  720,
  (engine) => spawnLine(engine, 4, -70, 46, -4),
  [
    [80, (engine) => setTargets(engine, [{ x: -70, y: -28, state: "dance" }, { x: -24, y: -6, state: "idle" }, { x: 22, y: -28, state: "dance" }, { x: 68, y: -6, state: "idle" }])],
    [220, (engine) => setTargets(engine, [{ x: -70, y: -6, state: "idle" }, { x: -24, y: -28, state: "dance" }, { x: 22, y: -6, state: "idle" }, { x: 68, y: -28, state: "dance" }])],
    [360, (engine) => engine.setStateAll("dance")],
    [560, (engine) => engine.finale()]
  ]
);

const scenarioMerge = phased(
  "merge",
  720,
  (engine) => scatterActors(engine, 5, 76, 20),
  [
    [120, (engine) => setTargets(engine, engine.actors.map(() => ({ x: 0, y: -10, state: "walk" })))],
    [320, (engine) => engine.formPhrase([PROPS.leaf], -96)],
    [480, (engine) => engine.setStateAll("idle")],
    [600, (engine) => burst(engine, 1.25)]
  ]
);

const scenarioExpansion = phased(
  "expansion",
  720,
  (engine) => spawnCircle(engine, 6, 14, -10),
  [
    [90, (engine) => setOrbit(engine, 28, -10)],
    [220, (engine) => setOrbit(engine, 48, -10)],
    [380, (engine) => engine.setStateAll("idle")],
    [520, (engine) => engine.setStateAll("finale")],
    [620, (engine) => burst(engine, 1)]
  ]
);

const scenarioOrbit = phased(
  "orbit",
  720,
  (engine) => {
    addActor(engine, { x: 0, y: -10, tx: 0, ty: -10, role: "smoker", state: "enter" });
    spawnCircle(engine, 4, 56, -8);
  },
  [
    [100, (engine) => {
      engine.setActorState(0, "smoke");
      engine.actors.slice(1).forEach((actor, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(engine.actors.length - 1, 1);
        actor.targetOffsetX = Math.cos(angle) * 56;
        actor.targetOffsetY = -8 + Math.sin(angle) * 22;
        engine.setActorState(index + 1, "walk");
      });
    }],
    [260, (engine) => engine.actors.slice(1).forEach((actor, index) => {
      const angle = (Math.PI * 2 * index) / 4 + 0.6;
      actor.targetOffsetX = Math.cos(angle) * 42;
      actor.targetOffsetY = -8 + Math.sin(angle) * 18;
      engine.setActorState(index + 1, "dance");
    })],
    [500, (engine) => engine.setStateAll("dance")],
    [620, (engine) => burst(engine, 1.2)]
  ]
);

const scenarioTeleport = phased(
  "teleport",
  660,
  (engine) => spawnLine(engine, 3, -46, 46, -8),
  [
    [100, (engine) => engine.setStateAll("idle")],
    [220, (engine) => setTargets(engine, [{ x: -82, y: -18, state: "walk" }, { x: 0, y: -4, state: "walk" }, { x: 82, y: -18, state: "walk" }])],
    [320, (engine) => setTargets(engine, [{ x: 72, y: -8, state: "walk" }, { x: -12, y: -22, state: "walk" }, { x: -82, y: -8, state: "walk" }])],
    [440, (engine) => setGlitch(engine, 1)],
    [560, (engine) => engine.finale()]
  ]
);

const scenarioFallFromTop = phased(
  "fall-top",
  720,
  (engine) => {
    for (let index = 0; index < 4; index += 1) {
      const tx = -72 + index * 48;
      addActor(engine, { x: tx, y: -90, tx, ty: -10, vy: 0.7, state: "enter" });
    }
  },
  [
    [140, (engine) => engine.setStateAll("idle")],
    [260, (engine) => setTargets(engine, [{ x: -72, y: -24, state: "dance" }, { x: -24, y: -6, state: "dance" }, { x: 24, y: -24, state: "dance" }, { x: 72, y: -6, state: "dance" }])],
    [460, (engine) => engine.setStateAll("walk")],
    [600, (engine) => engine.finale()]
  ]
);

const scenarioFinalBurst = phased(
  "final-burst",
  720,
  (engine) => spawnCircle(engine, 8, 18, -10),
  [
    [100, (engine) => engine.setStateAll("idle")],
    [220, (engine) => engine.formPhrase([PROPS.spark, PROPS.fire, PROPS.spark], -86)],
    [380, (engine) => engine.setStateAll("dance")],
    [520, (engine) => burst(engine, 1.6)]
  ]
);

const scenarioStory4_20 = phased(
  "story-4-20",
  720,
  (engine) => engine.spawnGroup(5),
  [
    [70, (engine) => engine.setStateAll("idle")],
    [170, (engine) => engine.setStateAll("smoke")],
    [340, (engine) => engine.setStateAll("dance")],
    [500, (engine) => engine.formPhrase(symbol420Tokens())],
    [620, (engine) => engine.finale()]
  ],
  2
);

const scenarioSmokeCircleLegacy = phased(
  "smoke-circle-legacy",
  620,
  (engine) => engine.spawnGroup(4, -12),
  [
    [60, (engine) => engine.setStateAll("idle")],
    [150, (engine) => engine.setStateAll("smoke")],
    [320, (engine) => engine.formPhrase([PROPS.smoke, PROPS.leaf, PROPS.smoke], -120)],
    [430, (engine) => engine.setStateAll("dance")],
    [540, (engine) => engine.finale()]
  ]
);

const scenarioDanceWaveLegacy = phased(
  "dance-wave-legacy",
  660,
  (engine) => engine.spawnGroup(6, 18),
  [
    [40, (engine) => engine.setStateAll("walk")],
    [130, (engine) => engine.setStateAll("dance")],
    [280, (engine) => engine.setStateAll("smoke")],
    [420, (engine) => engine.formPhrase(["<", ...symbol420Tokens(), ">"], -104)],
    [560, (engine) => engine.finale()]
  ]
);

export const ASCII_SCENARIOS: ScenarioDef[] = [
  scenarioMeetWalk,
  scenarioWalkingSmoker,
  scenarioPassJoint,
  scenarioCircleSmoke,
  scenarioDanceSmokers,
  scenarioChaosOrder,
  scenarioBuild4_20,
  scenarioSmokeTo4_20,
  scenarioChase,
  scenarioWave,
  scenarioSpiral,
  scenarioChainFollow,
  scenarioGlitch,
  scenarioJumps,
  scenarioMerge,
  scenarioExpansion,
  scenarioOrbit,
  scenarioTeleport,
  scenarioFallFromTop,
  scenarioFinalBurst,
  scenarioStory4_20,
  scenarioSmokeCircleLegacy,
  scenarioDanceWaveLegacy
];
