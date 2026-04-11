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
