// Scripted game session for the DOM tier (Sprint 4, Commit U3;
// docs/07_UI_ARCHITECTURE.md §8 test seam, §21 tier 3). Test-only.
//
// Builds a session through the real createGameSession with deterministic
// deps: a stub RoundAuthority (fixed crash point, jackpot and chests), a
// constant world Rng, and a recording renderer (SceneRenderer needs a real
// 2D context, which jsdom does not provide). Same shape as the session
// tests' harness (src/ui/session.test.ts).
//
// Hand-off across module resets: every DOM test boots a fresh module graph
// (vi.resetModules + dynamic import) so the component's module-scope
// session is new per test. The test "arms" the options here; the mocked
// session module (session-mock.ts) builds the session when it evaluates and
// stores the result back. The slot lives on globalThis because module-level
// state does not survive vi.resetModules. This module imports only types
// from @/ui/session: the value import would resolve to the mock itself.

import type { RoundAuthority } from "@/engine";
import type { CanvasRenderer, GameSession, GameSessionDeps } from "@/ui/session";

/** Crash point that is never reached — forces the sea-floor (jackpot) path. */
export const NEVER_CRASH = 1e9;

export interface ScriptedSessionOptions {
  /** Multiplier at which the chain snaps. Default: NEVER_CRASH (jackpot path). */
  crashPoint?: number;
}

export interface RendererRecord {
  disposed: boolean;
  frames: number;
}

export interface ScriptedSession {
  session: GameSession;
  /** One record per renderer the session constructed — one per canvas mount. */
  renderers: RendererRecord[];
}

/** The stub chests every scripted bonus reveals: 2×, 6.5×, 30×. */
export const SCRIPTED_JACKPOT = 100;

const stubAuthority = (crashPoint: number): RoundAuthority => ({
  sampleCrashPoint: () => crashPoint,
  sampleJackpot: () => SCRIPTED_JACKPOT,
  rollBonusChests: () => [
    { id: 0, multiplier: 2, opened: false },
    { id: 1, multiplier: 6.5, opened: false },
    { id: 2, multiplier: 30, opened: false },
  ],
});

/** Build a deterministic session from the (actual) createGameSession. */
export function buildScriptedSession(
  createGameSession: (deps: GameSessionDeps) => GameSession,
  options: ScriptedSessionOptions,
): ScriptedSession {
  const renderers: RendererRecord[] = [];
  const session = createGameSession({
    authority: stubAuthority(options.crashPoint ?? NEVER_CRASH),
    worldRng: { next: () => 0.5 },
    createRenderer: (): CanvasRenderer => {
      const record: RendererRecord = { disposed: false, frames: 0 };
      renderers.push(record);
      return {
        resize: () => {},
        frame: () => {
          record.frames++;
        },
        dispose: () => {
          record.disposed = true;
        },
      };
    },
  });
  return { session, renderers };
}

// ----- the hand-off slot (survives vi.resetModules) -----

interface Slot {
  armed: ScriptedSessionOptions | null;
  built: ScriptedSession | null;
}

const SLOT_KEY = "__aquadiveScriptedSessionSlot";
const slot = (): Slot => {
  const host = globalThis as unknown as Record<string, Slot | undefined>;
  return (host[SLOT_KEY] ??= { armed: null, built: null });
};

/** Arm the options for the next evaluation of the mocked session module. */
export function armScriptedSession(options: ScriptedSessionOptions): void {
  const s = slot();
  s.armed = options;
  s.built = null;
}

/** Called by session-mock.ts: build the armed session (one per arm). */
export function buildArmedSession(
  createGameSession: (deps: GameSessionDeps) => GameSession,
): GameSession {
  const s = slot();
  if (s.armed === null) {
    throw new Error(
      "No scripted session armed — boot DOM tests through bootScreen() (src/ui/test/dom-harness.ts)",
    );
  }
  s.built = buildScriptedSession(createGameSession, s.armed);
  s.armed = null;
  return s.built.session;
}

/** The session the mocked module built for the current boot. */
export function takeBuiltSession(): ScriptedSession {
  const built = slot().built;
  if (built === null) throw new Error("The mocked @/ui/session module was not evaluated");
  return built;
}
