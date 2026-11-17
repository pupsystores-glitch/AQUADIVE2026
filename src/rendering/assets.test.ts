// AssetManager tests (LA1: load status, decode before "ready", retry).
// Node env, with a fake image factory; no real image is loaded.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetManager, assets } from "./assets";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  complete = false;
  naturalWidth = 0;
  decodeCalls = 0;
  private resolveDecode: () => void = () => {};
  private rejectDecode: (e: unknown) => void = () => {};
  decode(): Promise<void> {
    this.decodeCalls++;
    return new Promise<void>((resolve, reject) => {
      this.resolveDecode = resolve;
      this.rejectDecode = reject;
    });
  }
  load() {
    this.complete = true;
    this.naturalWidth = 100;
    this.onload?.();
  }
  error() {
    this.complete = true;
    this.onerror?.();
  }
  decoded() {
    this.resolveDecode();
  }
  decodeFails() {
    this.rejectDecode(new Error("EncodingError"));
  }
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function setup() {
  const made: FakeImage[] = [];
  const manager = new AssetManager(() => {
    const image = new FakeImage();
    made.push(image);
    return image as unknown as HTMLImageElement;
  });
  const changes: string[] = [];
  manager.subscribe(() =>
    changes.push(
      manager
        .keys()
        .map((k) => manager.status(k))
        .join(","),
    ),
  );
  return { manager, made, changes };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssetManager — LA1 status", () => {
  it("loading → ready only after the image has loaded AND decoded", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png", b: "b.png" });
    expect(t.manager.keys()).toEqual(["a", "b"]);
    expect(t.manager.status("a")).toBe("loading");
    t.made[0].load();
    await flush();
    expect(t.manager.status("a")).toBe("loading");
    expect(t.made[0].decodeCalls).toBe(1);
    t.made[0].decoded();
    await flush();
    expect(t.manager.status("a")).toBe("ready");
    expect(t.manager.status("b")).toBe("loading");
  });

  it("a decode failure on a loaded image still counts as ready (it can be drawn)", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    t.made[0].load();
    t.made[0].decodeFails();
    await flush();
    expect(t.manager.status("a")).toBe("ready");
  });

  it("an error is failed, logged once; the draw handle stays not ready", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    t.made[0].error();
    await flush();
    expect(t.manager.status("a")).toBe("failed");
    expect(t.manager.get("a" as never).ready).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("retry loads a failed entry again with a fresh image and handle", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    const firstHandle = t.manager.get("a" as never);
    t.made[0].error();
    await flush();
    t.manager.retry("a");
    expect(t.made).toHaveLength(2);
    expect(t.made[1].src).toBe("a.png");
    expect(t.manager.status("a")).toBe("loading");
    expect(t.manager.get("a" as never)).not.toBe(firstHandle);
    t.made[1].load();
    t.made[1].decoded();
    await flush();
    expect(t.manager.status("a")).toBe("ready");
    expect(t.manager.get("a" as never).ready).toBe(true);
  });

  it("retry of a loading or ready entry, or an unknown key, does nothing", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    t.manager.retry("a");
    t.manager.retry("nope");
    expect(t.made).toHaveLength(1);
  });

  it("subscribers hear every status change", async () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    t.made[0].error();
    await flush();
    t.manager.retry("a");
    expect(t.changes).toEqual(["loading", "failed", "loading"]);
  });

  it("preloading the same key twice makes one image", () => {
    const t = setup();
    void t.manager.preload({ a: "a.png" });
    void t.manager.preload({ a: "a.png" });
    expect(t.made).toHaveLength(1);
  });

  it("without a window (SSR, node) the production entries stay loading and nothing throws", () => {
    expect(assets.keys()).toEqual(["anchor", "seaFloor", "ship", "shipShine"]);
    for (const key of assets.keys()) expect(assets.status(key)).toBe("loading");
    expect(assets.get("ship").ready).toBe(false);
  });
});
