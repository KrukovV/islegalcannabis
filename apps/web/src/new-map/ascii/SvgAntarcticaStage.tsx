import type { CSSProperties } from "react";
import type { SvgAnimal, SvgAntarcticKind, SvgPerson, SvgStory } from "./svg-scenarios";

const INK = "#1e3141";
const LIGHT_INK = "#526879";
const ICE = "rgba(238, 247, 247, 0.72)";
const ACCENT = "#4c8c6b";
const ACCENT_LIGHT = "#a7bfa0";
const JOINT = "#c9b78c";

const SVG_ANIMATION_CSS = `
  .ant-svg-scene { opacity: 0; animation: ant-scene-in 560ms ease-out forwards; }
  .ant-svg-motion, .ant-svg-bob, .ant-svg-arm, .ant-svg-leg, .ant-svg-smoke, .ant-svg-leaf,
  .ant-svg-animal, .ant-svg-aurora, .ant-svg-spark { transform-box: fill-box; }
  .ant-svg-bob { transform-origin: center bottom; animation: ant-bob 1.05s ease-in-out infinite; }
  .ant-svg-arm { transform-origin: top center; animation: ant-limb .92s ease-in-out infinite alternate; }
  .ant-svg-leg { transform-origin: top center; animation: ant-limb .92s ease-in-out infinite alternate-reverse; }
  .ant-svg-motion-walk { animation: ant-walk 7.6s ease-in-out infinite alternate; }
  .ant-svg-motion-gather { animation: ant-gather 6.8s ease-in-out infinite alternate; }
  .ant-svg-motion-dance { animation: ant-dance 1.2s ease-in-out infinite; }
  .ant-svg-motion-wave { animation: ant-wave 1.5s ease-in-out infinite; }
  .ant-svg-motion-orbit { transform-origin: center; animation: ant-orbit 7.8s linear infinite; }
  .ant-svg-motion-jump { animation: ant-jump 1.45s cubic-bezier(.45,.04,.55,.96) infinite; }
  .ant-svg-motion-glitch { animation: ant-glitch 2.2s steps(2,end) infinite; }
  .ant-svg-motion-drop { animation: ant-drop 5.4s cubic-bezier(.18,.82,.35,1) infinite; }
  .ant-svg-smoke { transform-origin: center; animation: ant-smoke-rise 1.8s ease-out infinite; }
  .ant-svg-leaf { transform-origin: center; animation: ant-leaf-rise 2.15s ease-out infinite; }
  .ant-svg-animal { transform-origin: center bottom; animation: ant-animal-bob 1.65s ease-in-out infinite; }
  .ant-svg-aurora { fill: none; stroke-linecap: round; animation: ant-aurora 4.2s ease-in-out infinite alternate; }
  .ant-svg-spark { animation: ant-spark 1.4s ease-in-out infinite; }
  .ant-svg-phrase { paint-order: stroke; stroke: rgba(255,255,255,.72); stroke-width: 7px; stroke-linejoin: round; }
  [data-ascii-state="reduced-motion"] .ant-svg-scene { opacity: 1; }
  @keyframes ant-scene-in { to { opacity: 1; } }
  @keyframes ant-bob { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-5px) rotate(1deg); } }
  @keyframes ant-limb { from { transform: rotate(-10deg); } to { transform: rotate(10deg); } }
  @keyframes ant-walk { from { transform: translateX(-24px); } to { transform: translateX(24px); } }
  @keyframes ant-gather { 0%,100% { transform: translateX(-10px); } 50% { transform: translateX(10px); } }
  @keyframes ant-dance { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-11px) rotate(2deg); } }
  @keyframes ant-wave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
  @keyframes ant-orbit { to { transform: rotate(360deg); } }
  @keyframes ant-jump { 0%,100% { transform: translateY(0); } 45% { transform: translateY(-24px); } }
  @keyframes ant-glitch { 0%,100% { transform: translate(0,0); opacity: .98; } 35% { transform: translate(-8px,3px); opacity: .62; } 70% { transform: translate(7px,-2px); opacity: .88; } }
  @keyframes ant-drop { 0% { transform: translateY(-100px); opacity: 0; } 30%,82% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(28px); opacity: 0; } }
  @keyframes ant-smoke-rise { 0% { opacity: .62; transform: translate(0,0) scale(.8); } 100% { opacity: 0; transform: translate(7px,-34px) scale(1.9); } }
  @keyframes ant-leaf-rise { 0% { opacity: .92; transform: translate(0,0) rotate(0); } 100% { opacity: 0; transform: translate(9px,-48px) rotate(28deg); } }
  @keyframes ant-animal-bob { 0%,100% { transform: translateY(0) rotate(-1deg); } 50% { transform: translateY(-7px) rotate(1deg); } }
  @keyframes ant-aurora { from { opacity: .2; stroke-width: 10px; } to { opacity: .55; stroke-width: 18px; } }
  @keyframes ant-spark { 0%,100% { opacity: .3; transform: scale(.65); } 50% { opacity: .95; transform: scale(1.2); } }
  @media (prefers-reduced-motion: reduce) {
    .ant-svg-scene, .ant-svg-motion, .ant-svg-bob, .ant-svg-arm, .ant-svg-leg, .ant-svg-smoke,
    .ant-svg-leaf, .ant-svg-animal, .ant-svg-aurora, .ant-svg-spark { animation: none !important; }
    .ant-svg-scene { opacity: 1; }
    .ant-svg-smoke, .ant-svg-leaf { opacity: .45; }
  }
`;

type SvgAntarcticaStageProps = {
  story: SvgStory;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  motionEnabled: boolean;
  className?: string;
  testId?: string;
  overlayState: string;
  storyCount: number;
};

function animationStyle(delay = 0, motionEnabled = true): CSSProperties {
  return {
    animationDelay: `${Number(delay.toFixed(2))}s`,
    animationPlayState: motionEnabled ? "running" : "paused"
  };
}

function Leaf({ x, y, delay = 0, scale = 1, motionEnabled }: { x: number; y: number; delay?: number; scale?: number; motionEnabled: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="ant-svg-leaf" style={animationStyle(delay, motionEnabled)}>
        <path d="M0,-10 C9,-4 10,9 0,18 C-10,9 -9,-4 0,-10 Z" fill={ACCENT} />
        <path d="M0,-8 L0,15" fill="none" stroke="#356b4f" strokeWidth="1.5" />
      </g>
    </g>
  );
}

function Smoke({ x, y, delay = 0, motionEnabled }: { x: number; y: number; delay?: number; motionEnabled: boolean }) {
  return (
    <>
      {[[0, 3.8], [0.45, 3.25], [0.9, 2.7]].map(([offset, radius]) => (
        <circle
          key={offset}
          className="ant-svg-smoke"
          cx={x}
          cy={y}
          r={radius}
          fill={ACCENT_LIGHT}
          style={animationStyle(delay + offset, motionEnabled)}
        />
      ))}
      <Leaf x={x - 4} y={y - 16} delay={delay + 0.25} scale={0.55} motionEnabled={motionEnabled} />
    </>
  );
}

function Person({ person, motionEnabled }: { person: SvgPerson; motionEnabled: boolean }) {
  const scale = person.scale ?? 1;
  const delay = person.delay ?? 0;
  const direction = person.facing === "left" ? -1 : 1;
  const leftArm = person.handsUp ? { x: -20, y: -72 } : { x: -21, y: -39 };
  const rightArm = person.handsUp ? { x: 20, y: -72 } : person.smoking ? { x: 25, y: -54 } : { x: 21, y: -39 };

  return (
    <g transform={`translate(${person.x} ${person.y})`} data-svg-role={person.smoking ? "smoker" : "walker"}>
      <ellipse cx="0" cy="10" rx="30" ry="9" fill={ACCENT} opacity="0.11" />
      <g
        className={`ant-svg-motion ant-svg-motion-${person.motion ?? "walk"}`}
        style={animationStyle(delay, motionEnabled)}
      >
        <g transform={`scale(${direction * scale} ${scale})`}>
          <g className="ant-svg-bob" style={animationStyle(delay, motionEnabled)}>
            <circle cx="0" cy="-72" r="10" fill={INK} />
            <line x1="0" y1="-61" x2="0" y2="-24" stroke={INK} strokeWidth="7" strokeLinecap="round" />
            <line
              className="ant-svg-arm"
              x1="0"
              y1="-56"
              x2={leftArm.x}
              y2={leftArm.y}
              stroke={INK}
              strokeWidth="6"
              strokeLinecap="round"
              style={animationStyle(delay, motionEnabled)}
            />
            <line
              className="ant-svg-arm"
              x1="0"
              y1="-56"
              x2={rightArm.x}
              y2={rightArm.y}
              stroke={INK}
              strokeWidth="6"
              strokeLinecap="round"
              style={animationStyle(delay + 0.45, motionEnabled)}
            />
            <line
              className="ant-svg-leg"
              x1="0"
              y1="-24"
              x2="-17"
              y2="6"
              stroke={INK}
              strokeWidth="7"
              strokeLinecap="round"
              style={animationStyle(delay, motionEnabled)}
            />
            <line
              className="ant-svg-leg"
              x1="0"
              y1="-24"
              x2="17"
              y2="6"
              stroke={INK}
              strokeWidth="7"
              strokeLinecap="round"
              style={animationStyle(delay + 0.45, motionEnabled)}
            />
            {person.smoking ? (
              <>
                <line x1="24" y1="-54" x2="40" y2="-59" stroke={JOINT} strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="41" cy="-59" r="2.4" fill="#8fbf4d" />
                <Smoke x={42} y={-60} delay={delay} motionEnabled={motionEnabled} />
              </>
            ) : null}
          </g>
        </g>
      </g>
    </g>
  );
}

function animalFamily(kind: SvgAntarcticKind) {
  if (["penguin", "emperorPenguin", "adeliePenguin", "chinstrapPenguin"].includes(kind)) return "penguin";
  if (["seal", "leopardSeal", "weddellSeal", "crabeaterSeal", "elephantSeal", "antarcticFurSeal"].includes(kind)) return "seal";
  if (["petrel", "skua", "albatross", "snowPetrel", "giantPetrel"].includes(kind)) return "bird";
  if (["orca", "minkeWhale"].includes(kind)) return "whale";
  return "krill";
}

function Penguin({ kind }: { kind: SvgAntarcticKind }) {
  const emperor = kind === "emperorPenguin";
  const chinstrap = kind === "chinstrapPenguin";
  return (
    <>
      <ellipse cx="0" cy="-22" rx={emperor ? 19 : 16} ry={emperor ? 30 : 26} fill={INK} />
      <ellipse cx="0" cy="-18" rx={emperor ? 11 : 10} ry={emperor ? 21 : 18} fill="#f4f7f4" />
      <circle cx="0" cy="-49" r={emperor ? 15 : 13} fill={INK} />
      <circle cx="-4" cy="-52" r="2" fill="#f7faf8" />
      <path d="M10,-49 L21,-45 L10,-42 Z" fill="#d3aa54" />
      <path d="M-13,-31 Q-28,-18 -18,-8" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <path d="M13,-31 Q28,-18 18,-8" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      {emperor ? <path d="M-9,-42 Q0,-34 9,-42" fill="none" stroke="#d3aa54" strokeWidth="4" /> : null}
      {chinstrap ? <path d="M-10,-43 Q0,-36 10,-43" fill="none" stroke="#f4f7f4" strokeWidth="2" /> : null}
      <path d="M-8,3 L-18,8 M8,3 L18,8" stroke="#d3aa54" strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Seal({ kind }: { kind: SvgAntarcticKind }) {
  const elephant = kind === "elephantSeal";
  const spotted = kind === "leopardSeal" || kind === "weddellSeal";
  return (
    <>
      <ellipse cx="-4" cy="-18" rx={elephant ? 31 : 27} ry={elephant ? 18 : 15} fill={LIGHT_INK} />
      <circle cx="20" cy="-28" r={elephant ? 15 : 13} fill={INK} />
      <circle cx="24" cy="-31" r="1.9" fill="#f7faf8" />
      <path d="M-17,-8 L-32,7 L-8,1 Z M8,-7 L23,6 L2,0 Z" fill={INK} opacity="0.9" />
      {elephant ? <path d="M31,-27 Q42,-18 32,-10" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" /> : null}
      {spotted ? <><circle cx="-13" cy="-23" r="3" fill={INK} opacity=".42" /><circle cx="0" cy="-14" r="2.5" fill={INK} opacity=".42" /></> : null}
      <path d="M30,-24 L42,-27 M30,-21 L43,-20" stroke={INK} strokeWidth="1.2" opacity=".72" />
    </>
  );
}

function Bird({ kind }: { kind: SvgAntarcticKind }) {
  const wide = kind === "albatross" || kind === "giantPetrel";
  const snow = kind === "snowPetrel";
  return (
    <>
      <ellipse cx="0" cy="-25" rx="15" ry="20" fill={snow ? "#f5f8f7" : LIGHT_INK} stroke={INK} strokeWidth="2" />
      <circle cx="8" cy="-45" r="10" fill={snow ? "#f5f8f7" : INK} stroke={INK} strokeWidth="2" />
      <circle cx="11" cy="-47" r="1.8" fill={snow ? INK : "#f7faf8"} />
      <path d="M17,-44 L30,-40 L18,-37 Z" fill="#d3aa54" />
      <path d={wide ? "M-8,-29 Q-38,-42 -47,-17 Q-24,-25 -7,-17" : "M-8,-30 Q-27,-38 -31,-18 Q-18,-24 -7,-16"} fill={INK} opacity=".92" />
      <path d={wide ? "M8,-29 Q37,-43 48,-18 Q25,-25 8,-17" : "M8,-30 Q27,-38 31,-18 Q18,-24 7,-16"} fill={INK} opacity=".92" />
      <path d="M-5,-5 L-11,7 M6,-5 L12,7" stroke="#d3aa54" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Whale({ kind }: { kind: SvgAntarcticKind }) {
  const orca = kind === "orca";
  return (
    <>
      <path d="M-37,-21 Q-13,-48 27,-32 Q42,-27 45,-13 Q23,-3 -10,-8 Q-28,-9 -37,-21 Z" fill={orca ? INK : LIGHT_INK} />
      <path d="M-34,-20 L-48,-33 L-44,-16 L-52,-6 L-34,-10 Z" fill={orca ? INK : LIGHT_INK} />
      <path d="M0,-34 L7,-54 L14,-31 Z" fill={orca ? INK : LIGHT_INK} />
      <circle cx="27" cy="-26" r="2" fill="#f7faf8" />
      {orca ? <path d="M8,-29 Q24,-23 31,-12 Q15,-8 1,-15 Z" fill="#f4f7f4" /> : <path d="M-8,-16 Q12,-9 28,-16" fill="none" stroke="#a9bdc5" strokeWidth="3" />}
    </>
  );
}

function Krill() {
  return (
    <>
      <path d="M-28,-24 Q-9,-41 20,-27 Q31,-21 25,-10 Q2,-3 -20,-12 Q-31,-16 -28,-24 Z" fill="#8e6672" />
      {[ -16, -7, 2, 11 ].map((x) => <path key={x} d={`M${x},-12 L${x - 7},4`} stroke="#6f4d58" strokeWidth="2" />)}
      <circle cx="20" cy="-25" r="2.5" fill={INK} />
      <path d="M-24,-20 L-38,-32 M-24,-17 L-40,-14" stroke="#8e6672" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Animal({ animal, motionEnabled }: { animal: SvgAnimal; motionEnabled: boolean }) {
  const family = animalFamily(animal.kind);
  return (
    <g transform={`translate(${animal.x} ${animal.y}) scale(${animal.scale ?? 0.88})`} data-svg-animal={animal.kind}>
      <ellipse cx="0" cy="8" rx="34" ry="8" fill={ACCENT} opacity="0.1" />
      <g className="ant-svg-animal" style={animationStyle(animal.delay, motionEnabled)}>
        {family === "penguin" ? <Penguin kind={animal.kind} /> : null}
        {family === "seal" ? <Seal kind={animal.kind} /> : null}
        {family === "bird" ? <Bird kind={animal.kind} /> : null}
        {family === "whale" ? <Whale kind={animal.kind} /> : null}
        {family === "krill" ? <Krill /> : null}
      </g>
    </g>
  );
}

function SceneAccent({ story, motionEnabled }: { story: SvgStory; motionEnabled: boolean }) {
  if (story.accent === "aurora") {
    return (
      <g opacity=".6">
        <path className="ant-svg-aurora" d="M-250,-130 Q-120,-210 0,-130 T250,-130" stroke="#77b98d" style={animationStyle(0, motionEnabled)} />
        <path className="ant-svg-aurora" d="M-220,-105 Q-90,-175 40,-105 T220,-105" stroke="#9bbec0" style={animationStyle(0.6, motionEnabled)} />
      </g>
    );
  }
  if (story.accent === "ice") {
    return <path d="M-260,9 Q-170,-16 -82,4 Q12,22 94,1 Q178,-18 262,9 Q152,42 8,30 Q-138,43 -260,9 Z" fill={ICE} stroke="rgba(112,151,159,.24)" />;
  }
  if (story.accent === "spark") {
    return (
      <g fill="#7cab72">
        {[-180, -92, 0, 92, 180].map((x, index) => (
          <circle key={x} className="ant-svg-spark" cx={x} cy={-100 - (index % 2) * 22} r="4" style={animationStyle(index * 0.22, motionEnabled)} />
        ))}
      </g>
    );
  }
  if (story.accent === "leaf") {
    return <Leaf x={0} y={-158} delay={0} scale={1.1} motionEnabled={motionEnabled} />;
  }
  return null;
}

export default function SvgAntarcticaStage({
  story,
  width,
  height,
  anchorX,
  anchorY,
  motionEnabled,
  className,
  testId,
  overlayState,
  storyCount
}: SvgAntarcticaStageProps) {
  const stageScale = Math.max(0.62, Math.min(1.08, width / 980));
  const figureCount = (story.people?.length ?? 0) + (story.animals?.length ?? 0);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
      data-testid={testId}
      data-renderer="svg"
      data-ascii-state={overlayState}
      data-ascii-scenario={story.id}
      data-svg-story={story.id}
      data-svg-story-count={storyCount}
      data-svg-figure-count={figureCount}
    >
      <title>{`Decorative Antarctica SVG story: ${story.title}`}</title>
      <style>{SVG_ANIMATION_CSS}</style>
      <g transform={`translate(${anchorX} ${anchorY}) scale(${stageScale})`}>
        <g key={story.id} className="ant-svg-scene" style={animationStyle(0, motionEnabled)}>
          <SceneAccent story={story} motionEnabled={motionEnabled} />
          <path d="M-282,12 H282" stroke="rgba(71,99,112,.26)" strokeWidth="1.5" />
          {story.people?.map((person, index) => <Person key={`${story.id}-person-${index}`} person={person} motionEnabled={motionEnabled} />)}
          {story.animals?.map((animal, index) => <Animal key={`${story.id}-${animal.kind}-${index}`} animal={animal} motionEnabled={motionEnabled} />)}
          {story.phrase ? (
            <text className="ant-svg-phrase" x="0" y="-112" textAnchor="middle" fontFamily="IBM Plex Mono, SFMono-Regular, monospace" fontSize="34" fontWeight="800" fill={INK}>
              {story.phrase}
            </text>
          ) : null}
        </g>
      </g>
    </svg>
  );
}
