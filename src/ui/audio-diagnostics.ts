// Audio diagnostics — a TEMPORARY, development-only recorder for the iPhone
// silence investigation (IOS-AUDIO, docs/08 §14 risk 17).
//
// Enabled only in DEV builds and only with `?audiodebug=1` in the page URL
// (see `audioDiagnosticsEnabled`). Production builds compile it out: the
// session creates it under an `import.meta.env.DEV` guard.
//
// It changes no audio behaviour. It wraps the audio host's existing
// injection seams (`createContext`, `fetch`, `createManager`, `createBank`,
// `createMediaElement`) around the same production factories, records what
// passes through them, and forwards every call unchanged. There is still one
// AudioContext, created by the AudioManager inside its first unlock.
//
// The only thing it can do by itself is `testSound()`: one `play()` of the
// approved BET 1 cue (`bet-clink-1`) through the normal manager, sound bank
// and buses. The manager's own rules apply: no sound while muted, before the
// unlock or while suspended. It never touches the engine, the wallet or any
// game state. It reads no personal data: the platform is reduced to "iOS or
// iPadOS: yes/no".
//
// Import exception: `src/ui/audio-host.ts` is the only production UI module
// that imports `src/audio`. This dev-only module also does, for the same
// factories the host uses by default.

import {
  createAudioManager,
  createBrowserAudioContext,
  type AudioContextLike,
  type AudioManager,
  type AudioManagerOptions,
  type MediaElementLike,
} from "@/audio/audio-manager";
import { SOUND_MANIFEST, type CueId } from "@/audio/manifest";
import {
  createSoundBank,
  type FetchLike,
  type SoundBank,
  type SoundBankOptions,
} from "@/audio/sound-bank";
import {
  AUDIO_MIX,
  browserMusicElement,
  isSilentSwitchPlatform,
  type AudioHostOptions,
  type PlatformHints,
} from "@/ui/audio-host";

/** The URL switch: `?audiodebug=1` (DEV builds only). */
export const AUDIO_DEBUG_PARAM = "audiodebug";

/** The cue `testSound()` plays: the approved BET 1 clink. */
export const DIAGNOSTIC_TEST_CUE: CueId = "bet-clink-1";

const HISTORY = 12;

export interface DiagnosticEntry {
  /** Milliseconds since the diagnostics started. */
  readonly t: number;
  readonly text: string;
}

export interface AudioDiagnosticsSnapshot {
  readonly iosOrIpados: boolean;
  readonly userActivationApi: boolean;
  readonly contextsCreated: number;
  readonly contextState: string;
  readonly contextTime: number | null;
  readonly sampleRate: number | null;
  readonly unlockCalls: number;
  readonly resumeCalls: number;
  readonly resumesPending: number;
  readonly resumesResolved: number;
  readonly resumesRejected: number;
  readonly sourcesStarted: number;
  readonly decodesOk: number;
  readonly decodesFailed: number;
  readonly gestures: readonly DiagnosticEntry[];
  readonly resumes: readonly DiagnosticEntry[];
  readonly stateChanges: readonly DiagnosticEntry[];
  readonly cueRequests: readonly DiagnosticEntry[];
  /** Per loaded cue: the bank status and the HTTP outcome. */
  readonly files: readonly { readonly cue: string; readonly bank: string; readonly http: string }[];
  /** The values last given to the manager (AUDIO_MIX × the user's setting). */
  readonly applied: { readonly muted: boolean | null } & Record<string, number | null>;
  readonly mix: Readonly<Record<string, number>>;
  readonly music: string;
  readonly visibility: string;
  readonly visibilityChanges: readonly DiagnosticEntry[];
  readonly lastError: DiagnosticEntry | null;
  readonly testSound: DiagnosticEntry | null;
}

export interface AudioDiagnostics {
  /** Spread into the session's audio host options. */
  readonly hostOptions: Pick<
    AudioHostOptions,
    "createContext" | "fetch" | "createManager" | "createBank" | "createMediaElement"
  >;
  snapshot(): AudioDiagnosticsSnapshot;
  /** A copyable plain-text report. */
  report(): string;
  /** Plays BET 1 once through the normal path; returns the outcome. */
  testSound(): string;
  /** Listens to gestures, visibility and `[audio]` console messages. Returns the removal. */
  install(): () => void;
}

interface DiagnosticsDeps {
  readonly createContext?: () => AudioContextLike | null;
  readonly fetch?: FetchLike;
  readonly createMediaElement?: () => MediaElementLike | null;
  readonly platform?: PlatformHints | null;
  readonly now?: () => number;
}

const describeError = (error: unknown): string => {
  if (error && typeof error === "object") {
    const { name, message } = error as { name?: unknown; message?: unknown };
    return `${typeof name === "string" ? name : "Error"}: ${typeof message === "string" ? message : ""}`;
  }
  return String(error);
};

/** True in a DEV build when the page URL has `?audiodebug=1`. Reads `location` at call time. */
export function audioDiagnosticsEnabled(search: string | null | undefined): boolean {
  if (typeof search !== "string") return false;
  try {
    return new URLSearchParams(search).get(AUDIO_DEBUG_PARAM) === "1";
  } catch {
    return false;
  }
}

export function createAudioDiagnostics(deps: DiagnosticsDeps = {}): AudioDiagnostics {
  const now =
    deps.now ?? (() => (typeof performance === "object" ? performance.now() : Date.now()));
  const started = now();
  const t = () => Math.round(now() - started);
  const push = (list: DiagnosticEntry[], text: string) => {
    list.push({ t: t(), text });
    if (list.length > HISTORY) list.shift();
  };
  const platform =
    deps.platform === undefined
      ? ((globalThis as { navigator?: PlatformHints }).navigator ?? null)
      : deps.platform;
  const userActivation = () =>
    (globalThis as { navigator?: { userActivation?: { isActive?: boolean } } }).navigator
      ?.userActivation;

  // ----- recorded state -----
  let context: AudioContextLike | null = null;
  let contextsCreated = 0;
  let unlockCalls = 0;
  let resumeCalls = 0;
  let resumesPending = 0;
  let resumesResolved = 0;
  let resumesRejected = 0;
  let sourcesStarted = 0;
  let decodesOk = 0;
  let decodesFailed = 0;
  const gestures: DiagnosticEntry[] = [];
  const resumes: DiagnosticEntry[] = [];
  const stateChanges: DiagnosticEntry[] = [];
  const cueRequests: DiagnosticEntry[] = [];
  const visibilityChanges: DiagnosticEntry[] = [];
  const http = new Map<string, string>();
  const applied: { muted: boolean | null } & Record<string, number | null> = {
    muted: null,
    master: null,
    music: null,
    ambience: null,
    sfx: null,
  };
  let music = "not requested yet (needs the first unlock)";
  let lastError: DiagnosticEntry | null = null;
  let testResult: DiagnosticEntry | null = null;
  let manager: AudioManager<CueId> | null = null;
  let bank: SoundBank<CueId> | null = null;

  /** File URL → cue, from the manifest the bank loads (the production one by default). */
  const urlToCue = new Map<string, string>();
  const mapUrls = (manifest: object) => {
    urlToCue.clear();
    for (const [cue, definition] of Object.entries(manifest)) {
      const url = (definition as { asset: { url: string } | null }).asset?.url;
      if (url) urlToCue.set(url, cue);
    }
  };
  mapUrls(SOUND_MANIFEST);

  const setError = (text: string) => {
    lastError = { t: t(), text };
  };

  // ----- seams -----

  const createContext = (): AudioContextLike | null => {
    const real = (deps.createContext ?? createBrowserAudioContext)();
    if (!real) {
      setError("no Web Audio: the context factory returned null");
      return null;
    }
    contextsCreated++;
    context = real;
    push(stateChanges, `created in state "${real.state}"`);
    real.addEventListener("statechange", () => push(stateChanges, `→ "${real.state}"`));
    const resume = real.resume.bind(real);
    (real as { resume: () => Promise<void> }).resume = () => {
      resumeCalls++;
      resumesPending++;
      const activation = userActivation()?.isActive;
      const at = `resume #${resumeCalls} (state "${real.state}", activation ${activation ?? "n/a"})`;
      push(resumes, `${at}: called`);
      const result = resume();
      result.then(
        () => {
          resumesPending--;
          resumesResolved++;
          push(resumes, `${at}: resolved → "${real.state}"`);
        },
        (error: unknown) => {
          resumesPending--;
          resumesRejected++;
          push(resumes, `${at}: rejected, ${describeError(error)}`);
          setError(`resume rejected: ${describeError(error)}`);
        },
      );
      return result;
    };
    const createBufferSource = real.createBufferSource.bind(real);
    (real as { createBufferSource: typeof createBufferSource }).createBufferSource = () => {
      const source = createBufferSource();
      const start = source.start.bind(source);
      source.start = (when?: number) => {
        sourcesStarted++;
        start(when);
      };
      return source;
    };
    return real;
  };

  const fetchSeam: FetchLike = (url, init) => {
    const base =
      deps.fetch ??
      ((u: string, i?: { readonly signal?: AbortSignal }) =>
        (globalThis as unknown as { fetch: FetchLike }).fetch(u, i));
    const cue = urlToCue.get(url) ?? url;
    http.set(cue, "requested");
    return base(url, init).then(
      (response) => {
        http.set(cue, `HTTP ${response.status}${response.ok ? "" : " (not OK)"}`);
        if (!response.ok) setError(`${cue}: HTTP ${response.status}`);
        return response;
      },
      (error: unknown) => {
        http.set(cue, `network error, ${describeError(error)}`);
        setError(`${cue}: fetch failed, ${describeError(error)}`);
        throw error;
      },
    );
  };

  const createManagerSeam = (options: AudioManagerOptions<CueId>): AudioManager<CueId> => {
    const real = createAudioManager<CueId>(options);
    manager = real;
    const started = (fn: () => void) => {
      const before = sourcesStarted;
      fn();
      return sourcesStarted > before;
    };
    const wrapped: AudioManager<CueId> = {
      unlock: () => {
        unlockCalls++;
        return real.unlock();
      },
      setBusGain: (bus, gain) => {
        applied[bus] = gain;
        real.setBusGain(bus, gain);
      },
      setMuted: (muted) => {
        applied.muted = muted;
        real.setMuted(muted);
      },
      play: (cue, opts) => {
        const ok = started(() => real.play(cue, opts));
        push(cueRequests, `play ${cue}: ${ok ? "source started" : `silent (${whySilent(cue)})`}`);
      },
      loop: (cue, opts) => {
        const before = sourcesStarted;
        const handle = real.loop(cue, opts);
        const ok = sourcesStarted > before;
        push(cueRequests, `loop ${cue}: ${ok ? "source started" : `waiting (${whySilent(cue)})`}`);
        return handle;
      },
      stream: (opts) => {
        push(cueRequests, `stream ${opts.bus}`);
        return real.stream(opts);
      },
      decode: (data) =>
        real.decode(data).then((buffer) => {
          if (buffer) decodesOk++;
          else {
            decodesFailed++;
            setError("a decode failed (decodeAudioData error, or no context)");
          }
          return buffer;
        }),
      suspend: () => real.suspend(),
      resume: () => real.resume(),
      dispose: () => real.dispose(),
    };
    return wrapped;
  };

  const createBankSeam = (options: SoundBankOptions<CueId>): SoundBank<CueId> => {
    mapUrls(options.manifest);
    const real = createSoundBank(options);
    bank = real;
    return real;
  };

  const createMediaElementSeam = (): MediaElementLike | null => {
    const element = (deps.createMediaElement ?? browserMusicElement)();
    if (element) music = "element created (streaming)";
    else if (isSilentSwitchPlatform(platform)) music = "off: iOS/iPadOS, Q15 (by design)";
    else music = "off: no media element in this browser";
    return element;
  };

  function whySilent(cue: CueId): string {
    if (!context) return "no context yet: no unlock";
    if (applied.muted) return "muted";
    const status = bank ? bank.status(cue) : "no bank";
    if (status !== "ready") return `cue ${status}`;
    if (context.state !== "running") return `context "${context.state}"`;
    return "voice cap or not unlocked";
  }

  // ----- public -----

  const snapshot = (): AudioDiagnosticsSnapshot => {
    const files: { cue: string; bank: string; http: string }[] = [];
    for (const cue of Object.keys(SOUND_MANIFEST) as CueId[]) {
      const status = bank ? bank.status(cue) : "no bank";
      if (status === "unavailable" || status === "unloaded") {
        if (!http.has(cue)) continue; // not loaded by design (disabled cues)
      }
      files.push({ cue, bank: status, http: http.get(cue) ?? "not requested" });
    }
    const doc = (globalThis as { document?: { visibilityState?: string } }).document;
    return {
      iosOrIpados: isSilentSwitchPlatform(platform),
      userActivationApi: userActivation() !== undefined,
      contextsCreated,
      contextState: context ? context.state : "none (not created yet)",
      contextTime: context ? Math.round(context.currentTime * 1000) / 1000 : null,
      sampleRate: context ? context.sampleRate : null,
      unlockCalls,
      resumeCalls,
      resumesPending,
      resumesResolved,
      resumesRejected,
      sourcesStarted,
      decodesOk,
      decodesFailed,
      gestures: [...gestures],
      resumes: [...resumes],
      stateChanges: [...stateChanges],
      cueRequests: [...cueRequests],
      files,
      applied: { ...applied },
      mix: { ...AUDIO_MIX },
      music,
      visibility: doc?.visibilityState ?? "unknown",
      visibilityChanges: [...visibilityChanges],
      lastError,
      testSound: testResult,
    };
  };

  const list = (entries: readonly DiagnosticEntry[]) =>
    entries.length === 0 ? ["  (none)"] : entries.map((e) => `  ${e.t} ms  ${e.text}`);

  const report = (): string => {
    const s = snapshot();
    const gain = (bus: string) =>
      s.applied[bus] === null ? "not applied" : String(s.applied[bus]);
    return [
      "AQUADIVE audio diagnostics (temporary, DEV)",
      `iOS/iPadOS: ${s.iosOrIpados ? "yes" : "no"}   userActivation API: ${s.userActivationApi ? "yes" : "no"}`,
      `AudioContext: ${s.contextState}   created: ${s.contextsCreated}   time: ${s.contextTime ?? "-"} s   rate: ${s.sampleRate ?? "-"}`,
      `unlock() calls: ${s.unlockCalls}   resume(): ${s.resumeCalls} called, ${s.resumesResolved} resolved, ${s.resumesRejected} rejected, ${s.resumesPending} pending`,
      `sources started: ${s.sourcesStarted}   decodes: ${s.decodesOk} ok, ${s.decodesFailed} failed`,
      `muted: ${s.applied.muted ?? "not applied"}   gains → master ${gain("master")}, sfx ${gain("sfx")}, ambience ${gain("ambience")}, music ${gain("music")}`,
      `designed mix: master ${s.mix.master}, sfx ${s.mix.sfx}, ambience ${s.mix.ambience}, music ${s.mix.music}`,
      `music: ${s.music}`,
      `visibility: ${s.visibility}`,
      `last error: ${s.lastError ? `${s.lastError.t} ms  ${s.lastError.text}` : "none"}`,
      `test sound: ${s.testSound ? `${s.testSound.t} ms  ${s.testSound.text}` : "not run"}`,
      "gestures:",
      ...list(s.gestures),
      "resume calls:",
      ...list(s.resumes),
      "context state:",
      ...list(s.stateChanges),
      "cue requests:",
      ...list(s.cueRequests),
      "files:",
      ...(s.files.length === 0
        ? ["  (none)"]
        : s.files.map((f) => `  ${f.cue}: ${f.bank}, ${f.http}`)),
      "visibility changes:",
      ...list(s.visibilityChanges),
    ].join("\n");
  };

  const testSound = (): string => {
    let text: string;
    if (!manager) text = "no audio manager";
    else {
      const before = sourcesStarted;
      manager.play(DIAGNOSTIC_TEST_CUE);
      text =
        sourcesStarted > before
          ? `BET 1 source started (context "${context?.state}")`
          : `BET 1 silent: ${whySilent(DIAGNOSTIC_TEST_CUE)}`;
    }
    testResult = { t: t(), text };
    return text;
  };

  const install = (): (() => void) => {
    const scope = globalThis as {
      window?: Window;
      document?: Document;
      console?: Console;
    };
    const win = scope.window;
    const doc = scope.document;
    const removals: (() => void)[] = [];
    if (win) {
      const onGesture = (event: Event) => {
        const pointer = (event as { pointerType?: string }).pointerType;
        const activation = userActivation()?.isActive;
        push(
          gestures,
          `${event.type}${pointer ? ` (${pointer})` : ""}, activation ${activation ?? "n/a"}, context "${context?.state ?? "none"}"`,
        );
      };
      for (const type of ["pointerdown", "touchend", "click", "keydown"]) {
        win.addEventListener(type, onGesture, { capture: true, passive: true });
        removals.push(() => win.removeEventListener(type, onGesture, { capture: true }));
      }
    }
    if (doc) {
      const onVisibility = () => push(visibilityChanges, doc.visibilityState);
      doc.addEventListener("visibilitychange", onVisibility);
      removals.push(() => doc.removeEventListener("visibilitychange", onVisibility));
    }
    const con = scope.console;
    if (con) {
      const original = { warn: con.warn, error: con.error };
      const tap =
        (fn: (...args: unknown[]) => void) =>
        (...args: unknown[]) => {
          if (typeof args[0] === "string" && args[0].startsWith("[audio]")) {
            setError(
              `${args[0]}${args.length > 1 && args[1] !== "" ? ` ${describeError(args[1])}` : ""}`,
            );
          }
          fn.apply(con, args);
        };
      con.warn = tap(original.warn);
      con.error = tap(original.error);
      removals.push(() => {
        con.warn = original.warn;
        con.error = original.error;
      });
    }
    return () => {
      for (const remove of removals.splice(0)) remove();
    };
  };

  return {
    hostOptions: {
      createContext,
      fetch: fetchSeam,
      createManager: createManagerSeam,
      createBank: createBankSeam,
      createMediaElement: createMediaElementSeam,
    },
    snapshot,
    report,
    testSound,
    install,
  };
}
