// Treasure chest art for the bonus picker (CH1, owner instruction 2026-11-17;
// replaces the Sprint 4 Bonus Chest drawing that lived in icons.tsx).
//
// One vector chest family in the owner's reference style: varnished planks,
// a rich gold frame with rivets and chamfered corner blocks, jewelled shield
// plates, a jewelled lock plate on the lid and a gold anchor with a rope on
// the front. Three wood/jewel palettes (ruby, sapphire, emerald) share one
// geometry. Two views share every proportion: `front` (straight on) and a
// three-quarter view that shows one side face (`left` or `right`, the latter
// mirrored), so a row of three reads as one set facing the player.
//
// `open` flips the lid back and reveals the treasure: the closed lid folds
// away toward its hinge, the lid's inner face rises behind the opening, and
// a gold glow and light rays bloom over the heap. The motion itself is CSS
// (`.chest-*` rules in styles.css: transform and opacity only; static under
// reduced motion). The art is decorative (aria-hidden): the button's
// accessible name stays its visible label.

export type ChestVariant = "ruby" | "sapphire" | "emerald";
/** Which side face shows: `front` none, `left` / `right` a three-quarter view. */
export type ChestView = "front" | "left" | "right";

interface ChestPalette {
  woodHi: string;
  woodMid: string;
  woodLo: string;
  /** Plank seams and the darkest wood. */
  seam: string;
  /** Plank grain highlights. */
  grain: string;
  /** The inside of the chest. */
  inner: string;
  jewelHi: string;
  jewel: string;
  jewelLo: string;
}

const CHEST_PALETTES: Record<ChestVariant, ChestPalette> = {
  ruby: {
    woodHi: "#ea3b37",
    woodMid: "#b5141b",
    woodLo: "#5f050b",
    seam: "#360205",
    grain: "#ff8a70",
    inner: "#2a0305",
    jewelHi: "#eefaff",
    jewel: "#3f9dff",
    jewelLo: "#0a2c80",
  },
  sapphire: {
    woodHi: "#4f7fcc",
    woodMid: "#244b92",
    woodLo: "#0c1f4f",
    seam: "#061131",
    grain: "#9cc0ff",
    inner: "#050e27",
    jewelHi: "#effdff",
    jewel: "#4ccbff",
    jewelLo: "#0a4c8a",
  },
  emerald: {
    woodHi: "#33b371",
    woodMid: "#127146",
    woodLo: "#04381f",
    seam: "#022213",
    grain: "#86e6ae",
    inner: "#031f10",
    jewelHi: "#edfff3",
    jewel: "#2fe07c",
    jewelLo: "#05612a",
  },
};

/** Gold metal stops, shared by every chest (the frame, anchor and heap). */
const GOLD = {
  light: "#fff4bd",
  bright: "#ffd64f",
  mid: "#f0aa22",
  deep: "#b8690d",
  dark: "#7a4206",
  edge: "#5a3004",
} as const;

/** Front-face geometry in the 200 × 160 viewBox; the side face is a sheared parallelogram. */
interface ChestGeometry {
  /** Front face, left and right edge. */
  x0: number;
  x1: number;
  /** The side face's far edge (x0 when there is no side face). */
  xf: number;
  /** Side-face width and how far its far edge rises (0 / 0 straight on). */
  depth: number;
  rise: number;
  /** Lid crest start / end, measured from the front face's left / right edge. */
  crestL: number;
  crestR: number;
  /** Scale of the centred hardware (lock plate, anchor) against the front view. */
  hardware: number;
}

const FRONT_GEOMETRY: ChestGeometry = {
  x0: 22,
  x1: 178,
  xf: 22,
  depth: 0,
  rise: 0,
  crestL: 20,
  crestR: -20,
  hardware: 1,
};

const ANGLED_GEOMETRY: ChestGeometry = {
  x0: 56,
  x1: 186,
  xf: 16,
  depth: 40,
  rise: 12,
  crestL: -20,
  crestR: -20,
  hardware: 0.86,
};

/** Shared vertical layout (viewBox units). */
const Y = {
  crest: 16,
  lidShoulder: 46,
  lipTop: 63,
  seam: 72,
  rimBottom: 82,
  railTop: 134,
  base: 146,
  lidPlanks: [34, 53],
  bodyPlanks: [93, 113],
  /** Open lid's inner face top. */
  innerTop: 8,
} as const;

const VIEW_W = 200;

/** A rectangle with cut corners (the frame's corner blocks and caps). */
function chamfer(x: number, y: number, w: number, h: number, c: number): string {
  return (
    `M${x + c} ${y}H${x + w - c}L${x + w} ${y + c}V${y + h - c}` +
    `L${x + w - c} ${y + h}H${x + c}L${x} ${y + h - c}V${y + c}Z`
  );
}

/** A diamond jewel: base, lower facet shade, upper-left highlight. */
function Jewel({ cx, cy, w, h, ids }: { cx: number; cy: number; w: number; h: number; ids: Ids }) {
  const top = `${cx} ${cy - h}`;
  const right = `${cx + w} ${cy}`;
  const bottom = `${cx} ${cy + h}`;
  const left = `${cx - w} ${cy}`;
  return (
    <g>
      <path
        d={`M${top}L${right}L${bottom}L${left}Z`}
        fill={ids.jewel}
        stroke={GOLD.edge}
        strokeWidth="0.8"
      />
      <path d={`M${cx} ${cy}L${right}L${bottom}Z`} fill="#000" opacity="0.28" />
      <path d={`M${top}L${cx - w * 0.45} ${cy - h * 0.1}L${cx} ${cy}Z`} fill="#fff" opacity="0.6" />
      <path
        d={`M${cx - w * 0.35} ${cy}L${cx} ${cy - h * 0.4}L${cx + w * 0.35} ${cy}L${cx} ${cy + h * 0.4}Z`}
        fill="none"
        stroke="#fff"
        strokeWidth="0.5"
        opacity="0.5"
      />
    </g>
  );
}

function Rivet({ cx, cy, r = 2.3, ids }: { cx: number; cy: number; r?: number; ids: Ids }) {
  return <circle cx={cx} cy={cy} r={r} fill={ids.rivet} stroke={GOLD.edge} strokeWidth="0.6" />;
}

/** Gradient and clip references for one chest instance. */
interface Ids {
  wood: string;
  lid: string;
  inner: string;
  gold: string;
  goldH: string;
  rivet: string;
  jewel: string;
  heap: string;
  coin: string;
  glow: string;
  ray: string;
  lidClip: string;
  capClip: string;
  innerClip: string;
}

/** The gold anchor with its rope, drawn in local coordinates around x = 0. */
function Anchor({ ids }: { ids: Ids }) {
  const body = (
    <>
      <circle cx="0" cy="93" r="5.4" fill="none" strokeWidth="3.6" />
      <rect x="-3.3" y="96" width="6.6" height="40" rx="1.6" />
      <rect x="-17" y="100" width="34" height="5.6" rx="2.6" />
      <circle cx="-17.6" cy="102.8" r="3.3" />
      <circle cx="17.6" cy="102.8" r="3.3" />
      <path d="M-29 116Q-26 138 0 146Q26 138 29 116L24 118Q21 132 0 139Q-21 132-24 118Z" />
      <path d="M-29.5 108L-35 122L-21 120Z" />
      <path d="M29.5 108L35 122L21 120Z" />
    </>
  );
  return (
    <g>
      {/* Embossed shadow, then the gold anchor. */}
      <g transform="translate(1.2 1.9)" fill="#000" stroke="#000" opacity="0.38">
        {body}
      </g>
      <g fill={ids.gold} stroke={GOLD.edge} strokeWidth="0.9">
        <g stroke={ids.gold}>
          <circle cx="0" cy="93" r="5.4" fill="none" strokeWidth="3.6" />
        </g>
        <circle cx="0" cy="93" r="7.2" fill="none" strokeWidth="0.7" />
        <circle cx="0" cy="93" r="3.6" fill="none" strokeWidth="0.7" />
        <rect x="-3.3" y="96" width="6.6" height="40" rx="1.6" />
        <rect x="-17" y="100" width="34" height="5.6" rx="2.6" />
        <circle cx="-17.6" cy="102.8" r="3.3" />
        <circle cx="17.6" cy="102.8" r="3.3" />
        <path d="M-29 116Q-26 138 0 146Q26 138 29 116L24 118Q21 132 0 139Q-21 132-24 118Z" />
        <path d="M-29.5 108L-35 122L-21 120Z" />
        <path d="M29.5 108L35 122L21 120Z" />
      </g>
      {/* Specular streak down the shank. */}
      <path d="M-1.4 98V133" stroke={GOLD.light} strokeWidth="1.1" opacity="0.8" />
      {/* Twisted rope around the shank. */}
      <path
        d="M3.2 97C15 101 13.5 113 1 117C-10 121-11.5 129-2.5 134"
        fill="none"
        stroke={GOLD.edge}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M3.2 97C15 101 13.5 113 1 117C-10 121-11.5 129-2.5 134"
        fill="none"
        stroke={GOLD.deep}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M3.2 97C15 101 13.5 113 1 117C-10 121-11.5 129-2.5 134"
        fill="none"
        stroke={GOLD.light}
        strokeWidth="2.4"
        strokeDasharray="1.5 1.7"
      />
    </g>
  );
}

/** Coins on the treasure heap, relative to the heap's centre. */
const HEAP_COINS: ReadonlyArray<readonly [number, number]> = [
  [-38, 66],
  [-24, 59],
  [-8, 55],
  [9, 54],
  [25, 58],
  [39, 65],
  [-15, 64],
  [16, 63],
  [0, 61],
];

/** Light-ray headings over the open chest, degrees from straight up. */
const RAY_ANGLES = [-62, -40, -20, 0, 20, 40, 62] as const;

export function TreasureChestArt({
  id,
  variant,
  view = "front",
  open = false,
  className,
}: {
  id: string;
  variant: ChestVariant;
  view?: ChestView;
  open?: boolean;
  className?: string;
}) {
  const palette = CHEST_PALETTES[variant];
  const g = view === "front" ? FRONT_GEOMETRY : ANGLED_GEOMETRY;
  const angled = view !== "front";
  const { x0, x1, xf, depth, rise } = g;
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  const ref = (n: string) => `url(#${id}-${n})`;
  const ids: Ids = {
    wood: ref("wood"),
    lid: ref("lid"),
    inner: ref("inner"),
    gold: ref("gold"),
    goldH: ref("goldH"),
    rivet: ref("rivet"),
    jewel: ref("jewel"),
    heap: ref("heap"),
    coin: ref("coin"),
    glow: ref("glow"),
    ray: ref("ray"),
    lidClip: ref("lidclip"),
    capClip: ref("capclip"),
    innerClip: ref("innerclip"),
  };

  // Side-face point: sheared so the far edge rises by `rise`.
  const sp = (x: number, y: number) => `${x} ${depth === 0 ? y : y - (rise * (x0 - x)) / depth}`;
  // Depth vector from the front opening edge to the back one.
  const dvx = angled ? -depth : 0;
  const dvy = angled ? -rise : -12;
  const heapX = cx + dvx / 2;
  const backY = Y.seam + dvy;

  const lidFront =
    `M${x0} ${Y.seam}L${x0} ${Y.lidShoulder}Q${x0} ${Y.crest} ${x0 + g.crestL} ${Y.crest}` +
    `L${x1 + g.crestR} ${Y.crest}Q${x1} ${Y.crest} ${x1} ${Y.lidShoulder}L${x1} ${Y.seam}Z`;
  const endCap =
    `M${x0} ${Y.seam}L${x0} ${Y.lidShoulder}Q${x0} ${Y.crest} ${x0 + g.crestL} ${Y.crest}` +
    `Q${xf} ${Y.crest} ${xf} ${Y.lidShoulder - rise}L${xf} ${Y.seam - rise}Z`;
  // The near half of the lid's cross-section, shifted `t` along the barrel (angled straps).
  const profile = (t: number) =>
    `M${x0 + t} ${Y.seam}L${x0 + t} ${Y.lidShoulder}Q${x0 + t} ${Y.crest} ${x0 + t + g.crestL} ${Y.crest}`;
  const innerA = x0 + dvx + 2;
  const innerB = x1 + dvx - 2;
  const innerLid =
    `M${innerA} ${backY}L${innerA} ${Y.innerTop + 16}Q${innerA} ${Y.innerTop} ${innerA + 16} ${Y.innerTop}` +
    `L${innerB - 16} ${Y.innerTop}Q${innerB} ${Y.innerTop} ${innerB} ${Y.innerTop + 16}L${innerB} ${backY}Z`;
  const hw = g.hardware;
  // Scale the centred hardware about (cx, y): `local` art is drawn around x = 0, otherwise at cx.
  const scaleAt = (y: number, local: boolean) =>
    `translate(${cx} ${y}) scale(${hw}) translate(${local ? 0 : -cx} ${-y})`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} 160`}
      className={`chest-art ${className ?? ""}`}
      data-open={open ? "" : undefined}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.woodHi} />
          <stop offset="0.5" stopColor={palette.woodMid} />
          <stop offset="1" stopColor={palette.woodLo} />
        </linearGradient>
        <linearGradient id={`${id}-lid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.woodMid} />
          <stop offset="0.28" stopColor={palette.woodHi} />
          <stop offset="1" stopColor={palette.woodLo} />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.woodLo} />
          <stop offset="1" stopColor={palette.inner} />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={GOLD.light} />
          <stop offset="0.3" stopColor={GOLD.bright} />
          <stop offset="0.62" stopColor={GOLD.mid} />
          <stop offset="0.86" stopColor={GOLD.deep} />
          <stop offset="1" stopColor={GOLD.dark} />
        </linearGradient>
        <linearGradient id={`${id}-goldH`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={GOLD.deep} />
          <stop offset="0.32" stopColor={GOLD.bright} />
          <stop offset="0.5" stopColor={GOLD.light} />
          <stop offset="0.72" stopColor={GOLD.mid} />
          <stop offset="1" stopColor={GOLD.dark} />
        </linearGradient>
        <radialGradient id={`${id}-rivet`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.45" stopColor={GOLD.bright} />
          <stop offset="1" stopColor={GOLD.dark} />
        </radialGradient>
        <linearGradient id={`${id}-jewel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={palette.jewelHi} />
          <stop offset="0.45" stopColor={palette.jewel} />
          <stop offset="1" stopColor={palette.jewelLo} />
        </linearGradient>
        <radialGradient id={`${id}-heap`} cx="0.5" cy="0.15" r="0.9">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.35" stopColor={GOLD.bright} />
          <stop offset="1" stopColor={GOLD.deep} />
        </radialGradient>
        <radialGradient id={`${id}-coin`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fffbe0" />
          <stop offset="0.5" stopColor={GOLD.bright} />
          <stop offset="1" stopColor={GOLD.mid} />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff6c8" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#ffd25a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffb52e" stopOpacity="0" />
        </radialGradient>
        <radialGradient
          id={`${id}-ray`}
          gradientUnits="userSpaceOnUse"
          cx={heapX}
          cy={backY + 4}
          r="84"
        >
          <stop offset="0" stopColor="#fffbe6" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#ffe08a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd25a" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-lidclip`}>
          <path d={lidFront} />
        </clipPath>
        <clipPath id={`${id}-capclip`}>
          <path d={endCap} />
        </clipPath>
        <clipPath id={`${id}-innerclip`}>
          <path d={innerLid} />
        </clipPath>
      </defs>

      <g transform={view === "right" ? `translate(${VIEW_W} 0) scale(-1 1)` : undefined}>
        {/* Contact shadow */}
        <ellipse
          cx={(xf + x1) / 2}
          cy={Y.base + 3}
          rx={(x1 - xf) / 2 + 6}
          ry="6"
          fill="#000"
          opacity="0.5"
        />

        {/* Open: glow and light rays bloom behind the lid and over the heap. */}
        {open && (
          <>
            <ellipse
              className="chest-glow"
              cx={heapX}
              cy={backY - 4}
              rx="104"
              ry="70"
              fill={ids.glow}
            />
            <g className="chest-rays">
              {RAY_ANGLES.map((deg) => {
                const a = (deg * Math.PI) / 180;
                const spread = 0.07;
                const len = 84;
                const ox = heapX;
                const oy = backY + 4;
                const p = (t: number) =>
                  `${ox + Math.sin(a + t) * len} ${oy - Math.cos(a + t) * len}`;
                return (
                  <path key={deg} d={`M${ox} ${oy}L${p(-spread)}L${p(spread)}Z`} fill={ids.ray} />
                );
              })}
            </g>
          </>
        )}

        {/* Side face (three-quarter views): planks, frame, shade. */}
        {angled && (
          <g>
            <path
              d={`M${sp(x0, Y.seam)}L${sp(x0, Y.base)}L${sp(xf, Y.base)}L${sp(xf, Y.seam)}Z`}
              fill={ids.wood}
              stroke={palette.seam}
              strokeWidth="1"
            />
            {Y.bodyPlanks.map((y) => (
              <path
                key={y}
                d={`M${sp(x0, y)}L${sp(xf, y)}`}
                stroke={palette.seam}
                strokeWidth="1.2"
              />
            ))}
            <path
              d={`M${sp(x0, Y.seam)}L${sp(xf, Y.seam)}L${sp(xf, Y.rimBottom)}L${sp(x0, Y.rimBottom)}Z`}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="0.8"
            />
            <path
              d={`M${sp(x0, Y.railTop)}L${sp(xf, Y.railTop)}L${sp(xf, Y.base)}L${sp(x0, Y.base)}Z`}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="0.8"
            />
            <path
              d={`M${sp(xf, Y.seam)}L${sp(xf + 10, Y.seam)}L${sp(xf + 10, Y.base)}L${sp(xf, Y.base)}Z`}
              fill={ids.goldH}
              stroke={GOLD.edge}
              strokeWidth="0.8"
            />
            <path
              d={`M${sp(x0, Y.seam)}L${sp(x0, Y.base)}L${sp(xf, Y.base)}L${sp(xf, Y.seam)}Z`}
              fill="#000"
              opacity="0.3"
            />
          </g>
        )}

        {/* Open: the lid's inner face rises behind the opening (hinge at the back edge). */}
        <g className="chest-lid-inner">
          <path d={innerLid} fill={ids.inner} />
          <g clipPath={ids.innerClip}>
            {[Y.innerTop + 17, Y.innerTop + 34].map((y) => (
              <g key={y}>
                <path
                  d={`M${innerA} ${y}H${innerB}`}
                  stroke="#000"
                  strokeWidth="1.3"
                  opacity="0.55"
                />
                <path
                  d={`M${innerA} ${y + 1.3}H${innerB}`}
                  stroke={palette.grain}
                  strokeWidth="0.6"
                  opacity="0.25"
                />
              </g>
            ))}
            <rect
              x={(innerA + innerB) / 2 - 9}
              y={Y.innerTop}
              width="18"
              height={backY - Y.innerTop}
              fill={ids.goldH}
              opacity="0.85"
            />
          </g>
          <path d={innerLid} fill="none" stroke={ids.gold} strokeWidth="4.5" />
        </g>

        {/* The opening and the treasure heap (hidden under the closed lid). */}
        <g className="chest-treasure">
          <path
            d={`M${x0 + 3} ${Y.seam}L${x1 - 3} ${Y.seam}L${x1 - 3 + dvx} ${backY}L${x0 + 3 + dvx} ${backY}Z`}
            fill={palette.inner}
          />
          <path
            d={`M${x0 + 6} ${Y.seam}Q${heapX} ${Y.seam - 42} ${x1 - 6} ${Y.seam}Z`}
            fill={ids.heap}
            stroke={GOLD.deep}
            strokeWidth="0.8"
          />
          {HEAP_COINS.map(([dx, y]) => (
            <ellipse
              key={`${dx}-${y}`}
              cx={heapX + dx * (w / 156)}
              cy={y}
              rx="6.4"
              ry="3"
              fill={ids.coin}
              stroke={GOLD.dark}
              strokeWidth="0.7"
            />
          ))}
          <Jewel cx={heapX - 30 * (w / 156)} cy={60} w={4.5} h={5.5} ids={ids} />
          <Jewel cx={heapX + 32 * (w / 156)} cy={59} w={4} h={5} ids={ids} />
          <circle
            cx={heapX + 2}
            cy="51"
            r="2.6"
            fill="#fffdf4"
            stroke="#c9b48a"
            strokeWidth="0.5"
          />
        </g>

        {/* Body front: planks with grain. */}
        <rect
          x={x0}
          y={Y.seam}
          width={w}
          height={Y.base - Y.seam}
          fill={ids.wood}
          stroke={palette.seam}
          strokeWidth="1.2"
        />
        {Y.bodyPlanks.map((y) => (
          <g key={y}>
            <path d={`M${x0} ${y}H${x1}`} stroke={palette.seam} strokeWidth="1.4" />
            <path
              d={`M${x0} ${y + 1.4}H${x1}`}
              stroke={palette.grain}
              strokeWidth="0.6"
              opacity="0.4"
            />
          </g>
        ))}
        {[84, 103, 124].map((y, i) => (
          <path
            key={y}
            d={`M${x0 + 24 + i * 6} ${y}q14 -2.4 28 0t28 0 M${x1 - 70 + i * 4} ${y + 2}q10 -2 20 0t22 0`}
            fill="none"
            stroke={palette.grain}
            strokeWidth="0.7"
            opacity="0.32"
          />
        ))}

        {/* Body frame: pillars, shield plates, bottom rail, corner blocks. */}
        <rect
          x={x0}
          y={Y.rimBottom}
          width="18"
          height={Y.railTop - Y.rimBottom}
          fill={ids.goldH}
          stroke={GOLD.edge}
          strokeWidth="0.8"
        />
        <rect
          x={x1 - 18}
          y={Y.rimBottom}
          width="18"
          height={Y.railTop - Y.rimBottom}
          fill={ids.goldH}
          stroke={GOLD.edge}
          strokeWidth="0.8"
        />
        {[x0 + 10, x1 - 10].map((sx) => (
          <g key={sx}>
            <path
              d={`M${sx - 13} ${Y.rimBottom}H${sx + 13}V${Y.rimBottom + 16}L${sx} ${Y.rimBottom + 29}L${sx - 13} ${Y.rimBottom + 16}Z`}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="0.9"
            />
            <Jewel cx={sx} cy={Y.rimBottom + 12} w={5} h={7} ids={ids} />
          </g>
        ))}
        <rect
          x={x0}
          y={Y.railTop}
          width={w}
          height={Y.base - Y.railTop}
          fill={ids.gold}
          stroke={GOLD.edge}
          strokeWidth="0.9"
        />
        <path
          d={`M${x0 + 4} ${Y.railTop + 1.6}H${x1 - 4}`}
          stroke={GOLD.light}
          strokeWidth="1"
          opacity="0.75"
        />
        <rect
          x={x0 - 3}
          y={Y.seam}
          width={w + 6}
          height={Y.rimBottom - Y.seam}
          fill={ids.gold}
          stroke={GOLD.edge}
          strokeWidth="0.9"
        />
        <path
          d={`M${x0} ${Y.seam + 1.8}H${x1}`}
          stroke={GOLD.light}
          strokeWidth="1"
          opacity="0.75"
        />
        {[x0 - 6, x1 - 20].map((bx) => (
          <g key={bx}>
            <path
              d={chamfer(bx, Y.seam - 1, 26, 18, 5)}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="0.9"
            />
            <Rivet cx={bx + 13} cy={Y.seam + 8} ids={ids} />
            <path
              d={chamfer(bx + 1, Y.railTop - 8, 24, 22, 6)}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="0.9"
            />
            <Rivet cx={bx + 13} cy={Y.railTop + 3} r={2.6} ids={ids} />
          </g>
        ))}

        {/* The anchor emblem. */}
        <g transform={scaleAt(116, true)}>
          <Anchor ids={ids} />
        </g>

        {/* Lid: folds away toward its hinge when the chest opens. */}
        <g className="chest-lid">
          {angled && (
            <g>
              <path d={endCap} fill={ids.lid} stroke={palette.seam} strokeWidth="1" />
              <g clipPath={ids.capClip}>
                <path d={endCap} fill="none" stroke={ids.gold} strokeWidth="16" />
                <path
                  d={`M${sp(x0, Y.lipTop)}L${sp(xf, Y.lipTop)}L${sp(xf, Y.seam)}L${sp(x0, Y.seam)}Z`}
                  fill={ids.gold}
                />
              </g>
              <path d={endCap} fill="#000" opacity="0.28" />
              <path d={endCap} fill="none" stroke={GOLD.edge} strokeWidth="0.9" />
            </g>
          )}
          <path d={lidFront} fill={ids.lid} stroke={palette.seam} strokeWidth="1.2" />
          <g clipPath={ids.lidClip}>
            {Y.lidPlanks.map((y) => (
              <g key={y}>
                <path d={`M${xf - 10} ${y}H${x1 + 10}`} stroke={palette.seam} strokeWidth="1.3" />
                <path
                  d={`M${xf - 10} ${y + 1.3}H${x1 + 10}`}
                  stroke={palette.grain}
                  strokeWidth="0.6"
                  opacity="0.4"
                />
              </g>
            ))}
            <path
              d={`M${x0 + 30} 26q14 -2.2 28 0t28 0 M${x1 - 64} 44q12 -2 24 0t22 0`}
              fill="none"
              stroke={palette.grain}
              strokeWidth="0.7"
              opacity="0.32"
            />
            {angled ? (
              <>
                <path
                  d={profile(w / 2)}
                  fill="none"
                  stroke={GOLD.edge}
                  strokeWidth="21.6"
                  opacity="0.35"
                />
                <path d={profile(w / 2)} fill="none" stroke={ids.goldH} strokeWidth="18" />
                <path
                  d={profile(w - 9)}
                  fill="none"
                  stroke={GOLD.edge}
                  strokeWidth="19.6"
                  opacity="0.35"
                />
                <path d={profile(w - 9)} fill="none" stroke={ids.goldH} strokeWidth="18" />
              </>
            ) : (
              <>
                <rect
                  x={x0 - 1}
                  y={Y.crest - 2}
                  width="20"
                  height={Y.seam - Y.crest + 2}
                  fill={ids.goldH}
                  stroke={GOLD.edge}
                  strokeWidth="0.9"
                />
                <rect
                  x={x1 - 19}
                  y={Y.crest - 2}
                  width="20"
                  height={Y.seam - Y.crest + 2}
                  fill={ids.goldH}
                  stroke={GOLD.edge}
                  strokeWidth="0.9"
                />
              </>
            )}
          </g>
          {!angled && (
            <rect
              x={cx - 11}
              y={Y.crest - 3}
              width="22"
              height={Y.seam - Y.crest + 3}
              rx="5"
              fill={ids.goldH}
              stroke={GOLD.edge}
              strokeWidth="0.9"
            />
          )}
          {/* Crest highlight */}
          <path
            d={`M${x0 + g.crestL + 4} ${Y.crest + 1.4}H${x1 + g.crestR - 4}`}
            stroke="#fff"
            strokeWidth="0.9"
            opacity="0.25"
          />
          {/* Strap rivets */}
          {angled
            ? [w / 2, w - 9].map((t) => (
                <g key={t}>
                  <Rivet cx={x0 + t} cy={Y.lidShoulder + 6} ids={ids} />
                  <Rivet
                    cx={x0 + t + g.crestL / 4}
                    cy={(Y.lidShoulder + 3 * Y.crest) / 4 + 2}
                    ids={ids}
                  />
                </g>
              ))
            : [x0 + 9, cx, x1 - 9].map((rx) => (
                <g key={rx}>
                  <Rivet cx={rx} cy={Y.crest + 8} ids={ids} />
                  {rx !== cx && <Rivet cx={rx} cy={Y.lidShoulder + 4} ids={ids} />}
                </g>
              ))}
          {/* Lid lip rail and its end caps. */}
          <rect
            x={x0 - 3}
            y={Y.lipTop}
            width={w + 6}
            height={Y.seam - Y.lipTop}
            fill={ids.gold}
            stroke={GOLD.edge}
            strokeWidth="0.9"
          />
          <path
            d={`M${x0} ${Y.lipTop + 1.6}H${x1}`}
            stroke={GOLD.light}
            strokeWidth="1"
            opacity="0.8"
          />
          {[x0 - 6, x1 - 20].map((bx) => (
            <g key={bx}>
              <path
                d={chamfer(bx, Y.lipTop - 4, 26, 13, 4)}
                fill={ids.gold}
                stroke={GOLD.edge}
                strokeWidth="0.9"
              />
              <Rivet cx={bx + 13} cy={Y.lipTop + 2.5} r={2} ids={ids} />
            </g>
          ))}
          {/* Jewelled lock plate across the seam. */}
          <g transform={scaleAt(68, false)}>
            <path
              d={`M${cx} 47L${cx + 22} 62L${cx + 19} 78L${cx} 90L${cx - 19} 78L${cx - 22} 62Z`}
              fill={ids.gold}
              stroke={GOLD.edge}
              strokeWidth="1"
            />
            <path
              d={`M${cx} 51L${cx + 18} 63L${cx + 15.5} 76L${cx} 86L${cx - 15.5} 76L${cx - 18} 63Z`}
              fill="none"
              stroke={GOLD.light}
              strokeWidth="0.8"
              opacity="0.7"
            />
            <Jewel cx={cx} cy={68} w={12} h={14} ids={ids} />
          </g>
        </g>
      </g>
    </svg>
  );
}
