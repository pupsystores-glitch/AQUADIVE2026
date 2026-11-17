// AssetManager — sprite loading for the renderer (Sprint 2, Commit R4;
// docs/05_RENDERING_ARCHITECTURE.md §15). Deliberately tiny, shaped for
// growth (atlases, theme-scoped manifests, versioned URLs — documented in
// §15, not built).
//
// V1 manifest: one entry, the anchor sprite. Preload starts at module init,
// matching the previous eager module-scope `new Image()` in draw/anchor.ts —
// first-frame behavior is unchanged. A failed load leaves `ready = false`
// and logs once; the game keeps running on vector art.
//
// LA1 (the startup screen, src/ui/startup.ts): each entry also has a load
// status, "loading" → "ready" | "failed". "ready" means loaded and, where the
// browser supports `HTMLImageElement.decode()`, decoded, so the first frame
// after it draws without a decode stall. `subscribe` reports each status
// change. `retry(key)` loads a failed entry again with a fresh image (the
// only retry; nothing retries by itself). The draw predicate `ready` on the
// handle is unchanged, and the handle is replaced only by a retry, which the
// draw code picks up because it calls `get` every frame.
//
// Rule (§15): no module-scope `new Image()` side effects outside this file;
// nothing else in the codebase touches asset URLs.

import anchorImgSrc from "@/assets/anchor.png";
import seaFloorImgSrc from "@/assets/sea-floor.png";
import shipImgSrc from "@/assets/ship.png";
import shipShineImgSrc from "@/assets/ship-shine.png";

export interface AssetHandle {
  readonly image: HTMLImageElement | null;
  readonly ready: boolean;
}

export type AssetManifest = Readonly<Record<string, string>>;

/** LA1: an entry's load status. Without `window` (SSR, node) an entry stays "loading". */
export type AssetStatus = "loading" | "ready" | "failed";

// `ready` reproduces the draw-time predicate the anchor blit used before R4
// (`img.complete && img.naturalWidth > 0`), so "draw nothing until loaded"
// — and "never draw a failed load" — behave exactly as they did.
class ImageHandle implements AssetHandle {
  constructor(readonly image: HTMLImageElement | null) {}

  get ready(): boolean {
    const img = this.image;
    return img !== null && img.complete && img.naturalWidth > 0;
  }
}

const NULL_HANDLE: AssetHandle = { image: null, ready: false };

/** The image factory: `new Image()` in a browser, null elsewhere. Injectable for tests. */
export type ImageFactory = () => HTMLImageElement | null;

const browserImage: ImageFactory = () => (typeof window !== "undefined" ? new Image() : null);

export class AssetManager {
  private readonly handles = new Map<string, ImageHandle>();
  private readonly urls = new Map<string, string>();
  private readonly statuses = new Map<string, AssetStatus>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly createImage: ImageFactory = browserImage) {}

  /** Start loading every manifest entry; resolves when all have settled (loads never reject). */
  preload(manifest: AssetManifest): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const [key, url] of Object.entries(manifest)) {
      if (this.handles.has(key)) continue;
      this.urls.set(key, url);
      const load = this.load(key, url);
      if (load) pending.push(load);
    }
    return Promise.all(pending).then(() => undefined);
  }

  get(key: AssetKey): AssetHandle {
    return this.handles.get(key) ?? NULL_HANDLE;
  }

  /** LA1: every key given to `preload`, in manifest order. */
  keys(): readonly string[] {
    return [...this.urls.keys()];
  }

  /** LA1: an entry's load status; "failed" for a key never preloaded. */
  status(key: string): AssetStatus {
    return this.statuses.get(key) ?? "failed";
  }

  /** LA1: called after every status change. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** LA1: loads a failed entry again, with a new image. Anything else: no-op. */
  retry(key: string): void {
    const url = this.urls.get(key);
    if (url === undefined || this.statuses.get(key) !== "failed") return;
    void this.load(key, url);
  }

  private load(key: string, url: string): Promise<void> | null {
    const image = this.createImage();
    const handle = new ImageHandle(image);
    this.handles.set(key, handle);
    this.setStatus(key, "loading");
    if (!image) return null;
    return new Promise<void>((resolve) => {
      const settle = (status: AssetStatus) => {
        // A later retry replaced this handle: its result is not ours to report.
        if (this.handles.get(key) === handle) this.setStatus(key, status);
        resolve();
      };
      image.onload = () => {
        // Decode before reporting ready, so the first frame never stalls on it.
        const decode = typeof image.decode === "function" ? image.decode() : null;
        if (decode && typeof decode.then === "function") {
          decode.then(
            () => settle("ready"),
            () => settle(image.naturalWidth > 0 ? "ready" : "failed"),
          );
        } else {
          settle("ready");
        }
      };
      image.onerror = () => {
        console.error(`[rendering/assets] failed to load "${key}" (${url})`);
        settle("failed");
      };
      image.src = url;
    });
  }

  private setStatus(key: string, status: AssetStatus): void {
    if (this.statuses.get(key) === status) return;
    this.statuses.set(key, status);
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("[rendering/assets] a status listener failed:", error);
      }
    }
  }
}

/** Manifest (§15): the anchor sprite, the sea floor artwork (wreck, treasure, ocean floor), the surface ship artwork (E-X6) and its shine overlay (E-X6 S3). */
const ASSET_MANIFEST = {
  anchor: anchorImgSrc,
  seaFloor: seaFloorImgSrc,
  ship: shipImgSrc,
  shipShine: shipShineImgSrc,
} as const;

export type AssetKey = keyof typeof ASSET_MANIFEST;

export const assets = new AssetManager();

// Eager preload at module init — matches the pre-R4 module-scope load.
void assets.preload(ASSET_MANIFEST);
