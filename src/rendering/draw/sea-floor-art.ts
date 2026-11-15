// Sea floor artwork — the sunken ship, treasure chests and ocean floor as one
// illustration (owner-supplied, src/assets/sea-floor.png), replacing the
// procedural floor of draw/sea-floor.ts whenever the image is loaded. The
// procedural floor stays as the fallback (docs/05 §15 failure policy).
//
// The artwork has a transparent sky (the wreck, rocks and floor are cut out),
// so the abyss gradient shows through above it. It is prepared once (docs/05
// §14 rule 5, static-scene pre-render): scaled to the working size. After that
// each frame is one drawImage.
//
// Placement: when the anchor reaches the floor the artwork's bottom edge sits
// on the bottom edge of the viewport, so the whole floor is in view on every
// screen. The anchor is pinned higher up at that moment, in front of the
// wreck; it then drops to the rest point on the sand (layers/actor.ts).

import type { AssetHandle } from "../assets";
import { ANCHOR_SCREEN_Y_FRAC } from "../constants";

// ----- Artwork geometry (image px) -----
const ART_W = 1291;
/** Rows used (the 1671×941 source scaled to ART_W wide is 727 rows). */
const ART_ROWS = 726;
/** The wreck's centre line: drawn at the centre of the viewport. */
const ART_SHIP_X = 640;
/** Where the anchor comes to rest: the sand in front of the wreck, beside the crown. */
const ART_REST_X = 795;
const ART_REST_Y = 668;

/** Smallest drawn scale: on narrow scenes the artwork is cropped at the sides instead of shrinking the wreck. */
const ART_MIN_SCALE = 0.7;
/** Viewport height below the anchor's pinned centre, as a fraction of the height. */
const BELOW_PIN_FRAC = 1 - ANCHOR_SCREEN_Y_FRAC;

/** Floor colour used below the artwork until it is sampled from the image. */
const FLOOR_FILL_FALLBACK = "rgb(22, 96, 204)";

export interface SeaFloorArtLayout {
  /** Top-left corner of the drawn artwork (screen px). */
  x: number;
  y: number;
  scale: number;
}

const layout: SeaFloorArtLayout = { x: 0, y: 0, scale: 1 };

/** Drawn scale for a viewport width: always covers the width, never below ART_MIN_SCALE. */
function artScale(w: number): number {
  return Math.max(ART_MIN_SCALE, w / (2 * ART_SHIP_X));
}

/**
 * Where the artwork is drawn for a `w` × `h` viewport and the floor's screen
 * Y (the anchor's pinned centre at impact): the wreck is centred, and at
 * impact the artwork's bottom edge is the viewport's bottom edge. The returned
 * object is reused by the next call.
 */
export function seaFloorArtLayout(w: number, h: number, floorY: number): SeaFloorArtLayout {
  const scale = artScale(w);
  layout.scale = scale;
  layout.x = w / 2 - ART_SHIP_X * scale;
  layout.y = floorY + BELOW_PIN_FRAC * h - ART_ROWS * scale;
  return layout;
}

/** How far (px) the artwork reaches above the floor's screen Y — the World layer's culling margin. */
export function seaFloorArtTopExtent(w: number, h: number): number {
  return ART_ROWS * artScale(w) - BELOW_PIN_FRAC * h;
}

const restPoint = { x: 0, y: 0 };

/**
 * Screen position of the sand the anchor comes to rest on (beside the crown).
 * The returned object is reused by the next call.
 */
export function seaFloorRestPoint(w: number, h: number, floorY: number): { x: number; y: number } {
  const l = seaFloorArtLayout(w, h, floorY);
  restPoint.x = l.x + ART_REST_X * l.scale;
  restPoint.y = l.y + ART_REST_Y * l.scale;
  return restPoint;
}

// ----- One-time preparation -----

let preparedFrom: HTMLImageElement | null = null;
let prepared: HTMLCanvasElement | null = null;
let floorFill = FLOOR_FILL_FALLBACK;

function prepare(image: HTMLImageElement): HTMLCanvasElement | null {
  if (preparedFrom === image) return prepared;
  preparedFrom = image;
  prepared = null;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = ART_W;
  canvas.height = ART_ROWS;
  const c = canvas.getContext("2d");
  if (!c) return null;
  // Scaled to the expected size, so a re-exported image of another resolution still fits.
  const rows = image.naturalHeight * (ART_W / image.naturalWidth);
  c.drawImage(image, 0, 0, ART_W, rows);
  try {
    const px = c.getImageData(ART_SHIP_X, ART_ROWS - 3, 1, 1).data;
    floorFill = `rgb(${px[0]}, ${px[1]}, ${px[2]})`;
  } catch {
    floorFill = FLOOR_FILL_FALLBACK;
  }
  prepared = canvas;
  return prepared;
}

/**
 * Draws the sea floor artwork. Returns false (and draws nothing) while the
 * image is not available, so the caller can fall back to the procedural floor.
 */
export function drawSeaFloorArt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floorY: number,
  art: AssetHandle,
): boolean {
  const image = art.ready ? art.image : null;
  if (!image) return false;
  const surface = prepare(image);
  if (!surface) return false;

  const l = seaFloorArtLayout(w, h, floorY);
  const drawnH = ART_ROWS * l.scale;
  ctx.drawImage(surface, l.x, l.y, ART_W * l.scale, drawnH);

  // Ocean floor below the artwork (only if the anchor overshoots the floor).
  const bottom = l.y + drawnH;
  if (bottom < h) {
    ctx.fillStyle = floorFill;
    ctx.fillRect(0, bottom - 1, w, h - bottom + 1);
  }
  return true;
}
