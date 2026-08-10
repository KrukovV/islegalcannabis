export type AsciiFacing = "right" | "left";

function padFrame(frame: string) {
  const lines = frame.split("\n");
  const width = Math.max(...lines.map((line) => line.length), 0);
  return lines.map((line) => line.padEnd(width, " "));
}

const MIRROR_CHAR_MAP: Record<string, string> = {
  "/": "\\",
  "\\": "/",
  "<": ">",
  ">": "<",
  "(": ")",
  ")": "(",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{"
};

export function mirrorAsciiFrame(frame: string) {
  return padFrame(frame)
    .map((line) =>
      [...line]
        .reverse()
        .map((char) => MIRROR_CHAR_MAP[char] || char)
        .join("")
    )
    .join("\n");
}

function mirrorFrames(frames: readonly string[]) {
  return frames.map((frame) => mirrorAsciiFrame(frame));
}

const SHORT_IDLE_RIGHT = [
  "   o     \n  /|\\    \n  / \\"
] as const;

const SHORT_WALK_RIGHT = [
  "   o     \n  /|\\    \n  / \\",
  "   o     \n  /|\\    \n  /| ",
  "   o     \n  /|\\    \n   |\\",
  "   o     \n  /|\\    \n  / \\"
] as const;

const SHORT_EXIT_RIGHT = [
  "   o     \n  /|\\    \n   |\\",
  "   o     \n  /|\\    \n  /| "
] as const;

const SHORT_DANCE_RIGHT = [
  "   o     \n  \\|/    \n  / \\",
  "   o     \n  /|\\    \n   | ",
  "   o     \n  \\|/    \n  / \\"
] as const;

// Antarctic wildlife faces are original ASCII frames rendered by the existing canvas actor engine.
const PENGUIN_FACE_FRAMES = [
  "  (o_o)  \n  /|_|\\ \n   / \\   ",
  "  (o.o)  \n  /|_|\\ \n   / \\   ",
  "  (^_^)  \n  /|_|\\ \n   / \\   ",
  "  (^-^)  \n  /|_|\\ \n   / \\   ",
  "  (o~o)  \n  /|_|\\ \n   / \\   "
] as const;

const SEAL_FACE_FRAMES = [
  "  (o_o)__\n(       )\n `-___-' ",
  "  (o.o)__\n(       )\n `-___-' ",
  "  (-_-)__\n(       )\n `-___-' ",
  "  (^_^)__\n(       )\n `-___-' ",
  "  (o~o)__\n(       )\n `-___-' "
] as const;

const PETREL_FACE_FRAMES = [
  "  (o_o)  \n <(   )> \n   / \\   ",
  "  (o.o)  \n <(   )> \n   / \\   ",
  "  (^_^)  \n <(   )> \n   / \\   ",
  "  (^-^)  \n <(   )> \n   / \\   ",
  "  (o~o)  \n <(   )> \n   / \\   "
] as const;

const ORCA_FACE_FRAMES = [
  "  (o_o)~ \n <|___|> \n  /   \\  ",
  "  (o.o)~ \n <|___|> \n  /   \\  ",
  "  (^_^)~ \n <|___|> \n  /   \\  ",
  "  (^-^)~ \n <|___|> \n  /   \\  ",
  "  (o~o)~ \n <|___|> \n  /   \\  "
] as const;

const SKUA_FACE_FRAMES = [
  "  (o_o)> \n <(   )> \n   / \\   ",
  "  (o.o)> \n <(   )> \n   / \\   ",
  "  (^_^) >\n <(   )> \n   / \\   ",
  "  (^-^) >\n <(   )> \n   / \\   ",
  "  (o~o)> \n <(   )> \n   / \\   "
] as const;

const ALBATROSS_FACE_FRAMES = [
  "  (o_o)> \n <(   )> \n  /   \\  ",
  "  (o.o)> \n <(   )> \n  /   \\  ",
  "  (^_^) >\n <(   )> \n  /   \\  ",
  "  (^-^) >\n <(   )> \n  /   \\  ",
  "  (o~o)> \n <(   )> \n  /   \\  "
] as const;

const KRILL_FACE_FRAMES = [
  "  (o_o)~ \n <(   )> \n  /| |\\  ",
  "  (o.o)~ \n <(   )> \n  /| |\\  ",
  "  (^_^)~ \n <(   )> \n  /| |\\  ",
  "  (^-^)~ \n <(   )> \n  /| |\\  ",
  "  (o~o)~ \n <(   )> \n  /| |\\  "
] as const;

const LEOPARD_SEAL_FACE_FRAMES = [
  "  (o_o)  \n <( V )> \n  /___\\  ",
  "  (o.o)  \n <( V )> \n  /___\\  ",
  "  (^_^)  \n <( V )> \n  /___\\  ",
  "  (^-^)  \n <( V )> \n  /___\\  ",
  "  (o~o)  \n <( V )> \n  /___\\  "
] as const;

const EMPEROR_PENGUIN_FACE_FRAMES = [
  "  (O_o)  \n  /|=|\\  \n   / \\   ",
  "  (O.O)  \n  /|=|\\  \n   / \\   ",
  "  (^o^)  \n  /|=|\\  \n   / \\   ",
  "  (^-^)  \n  /|=|\\  \n   / \\   ",
  "  (o~O)  \n  /|=|\\  \n   / \\   "
] as const;

const WEDDELL_SEAL_FACE_FRAMES = [
  "  (o=o)__\n(  ___  )\n `-----' ",
  "  (o.o)__\n(  ___  )\n `-----' ",
  "  (^=^)__\n(  ___  )\n `-----' ",
  "  (-=-)__\n(  ___  )\n `-----' ",
  "  (o~o)__\n(  ___  )\n `-----' "
] as const;

const SNOW_PETREL_FACE_FRAMES = [
  "  (o^o)  \n <( | )> \n   / \\   ",
  "  (o.o)  \n <( | )> \n   / \\   ",
  "  (^o^)  \n <( | )> \n   / \\   ",
  "  (-^-)  \n <( | )> \n   / \\   ",
  "  (o~o)  \n <( | )> \n   / \\   "
] as const;

const CRABEATER_SEAL_FACE_FRAMES = [
  "  (o_o)~ \n <(===)> \n  /___\\  ",
  "  (o.o)~ \n <(===)> \n  /___\\  ",
  "  (^_^)~ \n <(===)> \n  /___\\  ",
  "  (^-^)~ \n <(===)> \n  /___\\  ",
  "  (o~o)~ \n <(===)> \n  /___\\  "
] as const;

const ADELIE_PENGUIN_FACE_FRAMES = [
  "  (o^o)  \n  /|:|\\  \n   / \\   ",
  "  (o.o)  \n  /|:|\\  \n   / \\   ",
  "  (^o^)  \n  /|:|\\  \n   / \\   ",
  "  (^-^)  \n  /|:|\\  \n   / \\   ",
  "  (o~o)  \n  /|:|\\  \n   / \\   "
] as const;

const ELEPHANT_SEAL_FACE_FRAMES = [
  " _(o_o)_ \n(       )\n `-___-' ",
  " _(o.o)_ \n(       )\n `-___-' ",
  " _(^_^)_ \n(       )\n `-___-' ",
  " _(-^-)_ \n(       )\n `-___-' ",
  " _(o~o)_ \n(       )\n `-___-' "
] as const;

const MINKE_WHALE_FACE_FRAMES = [
  "  (o_o)~ \n<(_____)>\n  ~~~~~  ",
  "  (o.o)~ \n<(_____)>\n  ~~~~~  ",
  "  (^_^)~ \n<(_____)>\n  ~~~~~  ",
  "  (^-^)~ \n<(_____)>\n  ~~~~~  ",
  "  (o~o)~ \n<(_____)>\n  ~~~~~  "
] as const;

const CHINSTRAP_PENGUIN_FACE_FRAMES = [
  "  (o-o)  \n  /|=|\\ \n   / \\   ",
  "  (o.o)  \n  /|=|\\ \n   / \\   ",
  "  (^o^)  \n  /|=|\\ \n   / \\   ",
  "  (-=-)  \n  /|=|\\ \n   / \\   ",
  "  (o~o)  \n  /|=|\\ \n   / \\   "
] as const;

const ANTARCTIC_FUR_SEAL_FACE_FRAMES = [
  " _(o_o)_ \n(  w~w )\n `-___-' ",
  " _(o.o)_ \n(  w~w )\n `-___-' ",
  " _(^_^)_ \n(  w~w )\n `-___-' ",
  " _(-^-)_ \n(  w~w )\n `-___-' ",
  " _(o~o)_ \n(  w~w )\n `-___-' "
] as const;

const GIANT_PETREL_FACE_FRAMES = [
  "  (o_o)>>\n <|===|> \n  /___\\  ",
  "  (o.o)>>\n <|===|> \n  /___\\  ",
  "  (^o^)>>\n <|===|> \n  /___\\  ",
  "  (-^-)>>\n <|===|> \n  /___\\  ",
  "  (o~o)>>\n <|===|> \n  /___\\  "
] as const;

export const ASCII_ANTARCTIC_MASCOT_SSOT = {
  penguin: [...PENGUIN_FACE_FRAMES],
  seal: [...SEAL_FACE_FRAMES],
  petrel: [...PETREL_FACE_FRAMES],
  orca: [...ORCA_FACE_FRAMES],
  skua: [...SKUA_FACE_FRAMES],
  albatross: [...ALBATROSS_FACE_FRAMES],
  krill: [...KRILL_FACE_FRAMES],
  leopardSeal: [...LEOPARD_SEAL_FACE_FRAMES],
  emperorPenguin: [...EMPEROR_PENGUIN_FACE_FRAMES],
  weddellSeal: [...WEDDELL_SEAL_FACE_FRAMES],
  snowPetrel: [...SNOW_PETREL_FACE_FRAMES],
  crabeaterSeal: [...CRABEATER_SEAL_FACE_FRAMES],
  adeliePenguin: [...ADELIE_PENGUIN_FACE_FRAMES],
  elephantSeal: [...ELEPHANT_SEAL_FACE_FRAMES],
  minkeWhale: [...MINKE_WHALE_FACE_FRAMES],
  chinstrapPenguin: [...CHINSTRAP_PENGUIN_FACE_FRAMES],
  antarcticFurSeal: [...ANTARCTIC_FUR_SEAL_FACE_FRAMES],
  giantPetrel: [...GIANT_PETREL_FACE_FRAMES]
} as const;

export type AntarcticMascotKind = keyof typeof ASCII_ANTARCTIC_MASCOT_SSOT;

export function framesForAntarcticMascot(kind: AntarcticMascotKind) {
  return [...ASCII_ANTARCTIC_MASCOT_SSOT[kind]];
}

// User-provided smoke/carry poses are the right-facing SSOT. Left-facing poses are derived only by mirroring.
const CARRY_RIGHT = [
  "   o      \n  /|\\__.~ \n  / \\",
  "   o   ~~ \n  /|\\__.  \n  / \\"
] as const;

const LIFT_RIGHT = [
  "   o  _.~ \n  /|\\/    \n  / \\",
  "   o _.~  \n  /|\\/    \n  / \\",
  "   o _.~~ \n  /|\\/    \n  / \\"
] as const;

const NEAR_RIGHT = [
  "   o_.~~  \n  /|_\\    \n  / \\"
] as const;

const EXHALE_RIGHT = [
  "   o_.~~~ \n  /|_\\    \n  / \\",
  "   o _.~~ \n  /|_\\    \n  / \\"
] as const;

const DROP_RIGHT = [
  "   o _.~  \n  /|_\\    \n  / \\",
  "   o      \n  /|\\__.~ \n  / \\"
] as const;

export const ASCII_JOINT_SSOT = {
  carry: {
    right: [...CARRY_RIGHT],
    left: mirrorFrames(CARRY_RIGHT)
  },
  lift: {
    right: [...LIFT_RIGHT],
    left: mirrorFrames(LIFT_RIGHT)
  },
  near: {
    right: [...NEAR_RIGHT],
    left: mirrorFrames(NEAR_RIGHT)
  },
  exhale: {
    right: [...EXHALE_RIGHT],
    left: mirrorFrames(EXHALE_RIGHT)
  },
  drop: {
    right: [...DROP_RIGHT],
    left: mirrorFrames(DROP_RIGHT)
  }
} as const;

export const ASCII_BODY_SSOT = {
  idle: {
    right: [...SHORT_IDLE_RIGHT],
    left: mirrorFrames(SHORT_IDLE_RIGHT)
  },
  walk: {
    right: [...SHORT_WALK_RIGHT],
    left: mirrorFrames(SHORT_WALK_RIGHT)
  },
  exit: {
    right: [...SHORT_EXIT_RIGHT],
    left: mirrorFrames(SHORT_EXIT_RIGHT)
  },
  dance: {
    right: [...SHORT_DANCE_RIGHT],
    left: mirrorFrames(SHORT_DANCE_RIGHT)
  }
} as const;

export function framesForFacing<T extends readonly string[]>(frames: { right: T; left: string[] }, facing: AsciiFacing) {
  return facing === "left" ? [...frames.left] : [...frames.right];
}
