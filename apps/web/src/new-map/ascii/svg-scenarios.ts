export type SvgMotion = "walk" | "gather" | "dance" | "wave" | "orbit" | "jump" | "glitch" | "drop";

export type SvgPerson = {
  x: number;
  y: number;
  scale?: number;
  delay?: number;
  facing?: "left" | "right";
  smoking?: boolean;
  motion?: SvgMotion;
  handsUp?: boolean;
};

export type SvgAntarcticKind =
  | "penguin"
  | "seal"
  | "petrel"
  | "orca"
  | "skua"
  | "albatross"
  | "krill"
  | "leopardSeal"
  | "emperorPenguin"
  | "weddellSeal"
  | "snowPetrel"
  | "crabeaterSeal"
  | "adeliePenguin"
  | "elephantSeal"
  | "minkeWhale"
  | "chinstrapPenguin"
  | "antarcticFurSeal"
  | "giantPetrel";

export type SvgAnimal = {
  kind: SvgAntarcticKind;
  x: number;
  y: number;
  scale?: number;
  delay?: number;
};

export type SvgStory = {
  id: string;
  title: string;
  durationMs: number;
  people?: readonly SvgPerson[];
  animals?: readonly SvgAnimal[];
  phrase?: string;
  accent?: "leaf" | "spark" | "aurora" | "ice";
};

function line(count: number, options: Partial<SvgPerson> = {}): SvgPerson[] {
  const gap = count <= 3 ? 160 : Math.min(70, 400 / (count - 1));
  const start = -((count - 1) * gap) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: start + index * gap,
    y: index % 2 === 0 ? 0 : 6,
    delay: index * 0.13,
    facing: index < count / 2 ? "right" : "left",
    ...options
  }));
}

function circle(count: number, radiusX = 150, radiusY = 38, options: Partial<SvgPerson> = {}): SvgPerson[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count;
    return {
      x: Math.cos(angle) * radiusX,
      y: Math.sin(angle) * radiusY,
      scale: 0.92,
      delay: index * 0.12,
      facing: Math.cos(angle) > 0 ? "left" : "right",
      ...options
    };
  });
}

function animals(entries: ReadonlyArray<readonly [SvgAntarcticKind, number, number]>): SvgAnimal[] {
  return entries.map(([kind, x, y], index) => ({ kind, x, y, delay: index * 0.14 }));
}

const chorus = animals([
  ["penguin", -170, -18], ["seal", -102, 14], ["petrel", -34, -16],
  ["orca", 34, 12], ["seal", 102, -8], ["skua", 170, 12]
]);

const parade = animals([
  ["penguin", -210, 8], ["seal", -142, -8], ["petrel", -72, 10], ["orca", 0, -10],
  ["skua", 72, 8], ["penguin", 142, -10], ["seal", 210, 8]
]);

const constellation = animals([
  ["orca", 0, -58], ["penguin", -154, -12], ["petrel", 154, -12],
  ["seal", -80, 34], ["skua", 80, 34], ["penguin", 0, 52]
]);

const tidepool = animals([
  ["albatross", -174, -24], ["krill", -104, 20], ["leopardSeal", -34, -8],
  ["penguin", 38, 12], ["krill", 108, -16], ["seal", 178, 18]
]);

const aurora = animals([
  ["albatross", 0, -52], ["penguin", -166, -4], ["petrel", 166, -4],
  ["leopardSeal", -82, 38], ["krill", 82, 38], ["orca", 0, 50]
]);

const rookery = animals([
  ["emperorPenguin", -206, -22], ["penguin", -146, 12], ["snowPetrel", -86, -20],
  ["skua", -28, 16], ["weddellSeal", 34, -18], ["crabeaterSeal", 94, 16],
  ["krill", 152, -16], ["leopardSeal", 210, 14]
]);

const iceFloe = animals([
  ["orca", -190, -18], ["crabeaterSeal", -126, 18], ["emperorPenguin", -62, -14],
  ["snowPetrel", 0, 18], ["weddellSeal", 64, -16], ["penguin", 128, 18], ["krill", 192, -12]
]);

const packIce = animals([
  ["minkeWhale", -220, -20], ["adeliePenguin", -166, 20], ["emperorPenguin", -110, -18],
  ["snowPetrel", -54, 20], ["elephantSeal", 0, -20], ["crabeaterSeal", 56, 20],
  ["weddellSeal", 112, -18], ["krill", 168, 20], ["orca", 222, -20]
]);

const polynya = animals([
  ["minkeWhale", 0, -54], ["adeliePenguin", -184, -6], ["snowPetrel", 184, -6],
  ["elephantSeal", -116, 38], ["leopardSeal", -38, 42], ["crabeaterSeal", 40, 42],
  ["krill", 118, 38], ["penguin", 0, 58]
]);

const iceberg = animals([
  ["giantPetrel", 0, -62], ["chinstrapPenguin", -214, -12], ["adeliePenguin", -158, 28],
  ["antarcticFurSeal", -104, -10], ["weddellSeal", -50, 30], ["crabeaterSeal", 6, -10],
  ["krill", 62, 30], ["snowPetrel", 120, -10], ["penguin", 180, 28]
]);

const shelf = animals([
  ["giantPetrel", -206, -20], ["chinstrapPenguin", -148, 18], ["emperorPenguin", -88, -18],
  ["albatross", -28, 18], ["antarcticFurSeal", 34, -18], ["elephantSeal", 96, 18],
  ["leopardSeal", 158, -16], ["minkeWhale", 218, 18]
]);

const people = {
  walkers: line(3, { motion: "walk" }),
  meeting: [
    { x: -156, y: 4, facing: "right", motion: "gather" },
    { x: 156, y: 4, facing: "left", motion: "gather", delay: 0.2 }
  ] satisfies SvgPerson[],
  pass: line(3, { smoking: true, motion: "gather" }),
  smokeCircle: circle(6, 158, 38, { smoking: true, motion: "gather" }),
  dancers: line(5, { smoking: true, motion: "dance", handsUp: true }),
  crowd: line(6, { motion: "gather" }),
  builders: line(8, { motion: "jump" }),
  pair: line(2, { smoking: true, motion: "gather" }),
  chase: line(2, { motion: "walk" }),
  wave: line(6, { motion: "wave", handsUp: true }),
  spiral: circle(6, 146, 48, { motion: "orbit" }),
  chain: line(5, { motion: "walk" }),
  glitch: line(4, { motion: "glitch" }),
  jumps: line(4, { motion: "jump", handsUp: true }),
  merge: circle(5, 154, 44, { motion: "gather" }),
  expansion: circle(6, 112, 34, { motion: "orbit" }),
  orbit: [{ x: 0, y: 4, smoking: true, motion: "dance" }, ...circle(4, 156, 42, { motion: "orbit" })] satisfies SvgPerson[],
  teleport: line(3, { motion: "glitch" }),
  falling: line(4, { motion: "drop" }),
  burst: circle(8, 132, 42, { motion: "dance", handsUp: true })
} as const;

// The catalog translates every established Canvas scenario into an inline-SVG scene.
// People and wildlife are intentionally interleaved so Antarctic mascots appear in the first cycle minute.
export const SVG_STORIES: readonly SvgStory[] = [
  { id: "walking-smoker", title: "Walking smokers", durationMs: 8_000, people: people.walkers.map((person) => ({ ...person, smoking: true })) },
  { id: "antarctic-face-chorus", title: "Antarctic chorus", durationMs: 8_000, animals: chorus, accent: "ice" },
  { id: "meet-walk", title: "Meet and walk", durationMs: 8_000, people: people.meeting },
  { id: "pass-joint", title: "Pass the joint", durationMs: 9_000, people: people.pass },
  { id: "antarctic-face-parade", title: "Antarctic parade", durationMs: 8_000, animals: parade, accent: "ice" },
  { id: "circle-smoke", title: "Smoke circle", durationMs: 9_000, people: people.smokeCircle, accent: "leaf" },
  { id: "dance-smokers", title: "Dance smokers", durationMs: 8_000, people: people.dancers },
  { id: "antarctic-face-constellation", title: "Animal constellation", durationMs: 8_000, animals: constellation, accent: "spark" },
  { id: "build-4-20", title: "Build 4:20", durationMs: 9_000, people: people.builders, phrase: "4:20", accent: "leaf" },
  { id: "smoke-to-4-20", title: "Smoke to 4:20", durationMs: 9_000, people: people.pair, phrase: "~ 4:20 ~" },
  { id: "antarctic-face-tidepool", title: "Antarctic tidepool", durationMs: 8_000, animals: tidepool, accent: "ice" },
  { id: "chase", title: "Chase", durationMs: 8_000, people: people.chase },
  { id: "wave", title: "Human wave", durationMs: 8_000, people: people.wave },
  { id: "antarctic-face-aurora", title: "Aurora", durationMs: 9_000, animals: aurora, accent: "aurora" },
  { id: "spiral", title: "Spiral", durationMs: 8_000, people: people.spiral },
  { id: "chain-follow", title: "Chain follow", durationMs: 8_000, people: people.chain },
  { id: "antarctic-face-rookery", title: "Rookery", durationMs: 9_000, animals: rookery, accent: "ice" },
  { id: "glitch", title: "Glitch", durationMs: 7_000, people: people.glitch },
  { id: "jumps", title: "Jumps", durationMs: 8_000, people: people.jumps },
  { id: "antarctic-face-ice-floe", title: "Ice floe", durationMs: 8_000, animals: iceFloe, accent: "ice" },
  { id: "merge", title: "Merge into a leaf", durationMs: 8_000, people: people.merge, phrase: "◆", accent: "leaf" },
  { id: "expansion", title: "Expansion", durationMs: 8_000, people: people.expansion },
  { id: "antarctic-face-pack-ice", title: "Pack ice", durationMs: 9_000, animals: packIce, accent: "ice" },
  { id: "orbit", title: "Orbit", durationMs: 8_000, people: people.orbit },
  { id: "teleport", title: "Teleport", durationMs: 7_000, people: people.teleport },
  { id: "antarctic-face-polynya", title: "Polynya", durationMs: 9_000, animals: polynya, accent: "ice" },
  { id: "fall-top", title: "Fall from the top", durationMs: 8_000, people: people.falling },
  { id: "final-burst", title: "Final burst", durationMs: 8_000, people: people.burst, phrase: ". + .", accent: "spark" },
  { id: "antarctic-face-iceberg", title: "Iceberg", durationMs: 9_000, animals: iceberg, accent: "ice" },
  { id: "story-4-20", title: "4:20 story", durationMs: 9_000, people: people.dancers, phrase: "4:20", accent: "leaf" },
  { id: "smoke-circle-legacy", title: "Smoke leaf circle", durationMs: 8_000, people: circle(4, 126, 34, { smoking: true, motion: "orbit" }), phrase: "~ ◆ ~", accent: "leaf" },
  { id: "antarctic-face-shelf", title: "Ice shelf", durationMs: 9_000, animals: shelf, accent: "ice" },
  { id: "dance-wave-legacy", title: "Dance wave 4:20", durationMs: 9_000, people: people.wave.map((person) => ({ ...person, smoking: true })), phrase: "< 4:20 >" },
  { id: "chaos-order", title: "Chaos into order", durationMs: 8_000, people: people.crowd }
] as const;

export const SVG_STORY_IDS = SVG_STORIES.map((story) => story.id);

export function nextSvgStoryIndex(currentIndex: number) {
  return (currentIndex + 1) % SVG_STORIES.length;
}
