// Sea floor artwork — the sunken ship, treasure chests and ocean floor as one
// illustration (owner-supplied, src/assets/sea-floor.png), replacing the
// procedural floor of draw/sea-floor.ts whenever the image is loaded. The
// procedural floor stays as the fallback (docs/05 §15 failure policy).
//
// The artwork is an opaque scene, so it is prepared once (docs/05 §14 rule 5,
// static-scene pre-render): its dark padding band at the bottom is cropped
// off, and its top fades to transparent so it blends into the abyss gradient
// instead of ending in a hard edge. After that each frame is one drawImage
// plus one fill below it.

import type { AssetHandle } from "../assets";

// ----- Artwork geometry (image px) -----
const ART_W = 1291;
/** Rows used; the artwork's last rows are a dark padding band. */
const ART_ROWS = 726;
/** The wreck's deck: the point the anchor comes down on. */
const ART_SHIP_X = 640;
const ART_DECK_Y = 560;
/** Rows over which the top of the artwork fades in. */
const ART_FADE_ROWS = 300;

/** Smallest drawn scale: on narrow scenes the artwork is cropped at the sides instead of shrinking the wreck. */
const ART_MIN_SCALE = 0.7;
/** The deck sits this far (px) below the anchor's pinned centre at impact, under the anchor's flukes. */
const DECK_BELOW_ANCHOR = 60;

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
 * Where the artwork is drawn for a viewport width and the floor's screen Y
 * (the anchor's pinned centre at impact): the wreck is centred, its deck just
 * below the anchor. The returned object is reused by the next call.
 */
export function seaFloorArtLayout(w: number, floorY: number): SeaFloorArtLayout {
  const scale = artScale(w);
  layout.scale = scale;
  layout.x = w / 2 - ART_SHIP_X * scale;
  layout.y = floorY + DECK_BELOW_ANCHOR - ART_DECK_Y * scale;
  return layout;
}

/** How far (px) the artwork reaches above the floor's screen Y — the World layer's culling margin. */
export function seaFloorArtTopExtent(w: number): number {
  return ART_DECK_Y * artScale(w) - DECK_BELOW_ANCHOR;
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
  // Fade the top in: keep the artwork only where this gradient is opaque.
  c.globalCompositeOperation = "destination-in";
  const fade = c.createLinearGradient(0, 0, 0, ART_FADE_ROWS);
  fade.addColorStop(0, "rgba(0, 0, 0, 0)");
  fade.addColorStop(1, "rgba(0, 0, 0, 1)");
  c.fillStyle = fade;
  c.fillRect(0, 0, ART_W, ART_ROWS);
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

  const l = seaFloorArtLayout(w, floorY);
  const drawnH = ART_ROWS * l.scale;
  ctx.drawImage(surface, l.x, l.y, ART_W * l.scale, drawnH);

  // Ocean floor below the artwork, down to the bottom edge.
  const bottom = l.y + drawnH;
  if (bottom < h) {
    ctx.fillStyle = floorFill;
    ctx.fillRect(0, bottom - 1, w, h - bottom + 1);
  }
  return true;
}
