// Sealed prepared rounds of the offline Global Round Scheduler (P8-4b-2). PLAY MONEY ONLY; OFFLINE
// DEVELOPMENT ONLY.
//
// A prepared RoundScript is SECRET until its disclosure ticks. The scheduler never holds a bare
// RoundScript: the source seals each verified script as soon as it receives it, and everything
// until the round's opening sees only the seal.
//
// - `admission` is the only readable part: the approved PUBLIC metadata (chain id, chain index,
//   fv, script version, status). Admission decisions read nothing else — no outcome, tick,
//   sample, size or digest.
// - The script is opened exactly ONCE, by the round's disclosure cursor (disclosure.ts) at the
//   round's opening tick. A second open, or an open after `discard()`, throws `sealed-misuse`.
//   `discard()` drops the reference of a script that will never be played (a missed deadline, a
//   halt): it is never opened, so nothing of its content is ever read. (A RoundScript has no
//   dispose(): its canonical bytes stay in memory until garbage collection.)
// - The opening capability is a closure created in the class's static block and held in a
//   module-private binding: no property, symbol or export of the class or the module refers to
//   it. `claimSealedRoundOpener()` hands it out ONCE per module instance; disclosure.ts claims it
//   when it loads, so every later claim (any other caller, compiled or not) is refused with
//   `sealed-misuse: opener-claimed`. If anything claimed it first, disclosure.ts fails to load and
//   the scheduler cannot start (fail closed). A fresh module instance (e.g. after deleting the
//   module cache) has its own class: its opener cannot open the seals of this one.
// - SOURCE AUTHENTICATION (R-1 correction). A seal remembers, in a private field, the source it
//   was made for. Only the capability returned by `claimSourceSealing()` (claimed ONCE per module
//   instance, by source.ts as it loads) makes such seals; `sealedBy(seal, origin)` holds only for
//   an unopened seal made for exactly that source. The driver (scheduler.ts) admits nothing else:
//   a TEST seal (`sealRoundScript`, no origin; used by the pure core's tests) or a seal of any
//   other source is refused as a source contract violation. The brand is a private field (not a
//   WeakSet), so the check consults no shared built-in method.
// - The class, its prototype and this module's CommonJS exports are FROZEN as the module loads
//   (R-1): no method, static or export can be replaced or intercepted afterwards.
// - JSON.stringify, String(), template literals and Node's util.inspect show the public metadata
//   and the redaction marker only. Defense in depth against accidental disclosure in logs and
//   errors, and against ORDINARY callers; NOT isolation from arbitrary privileged code running in
//   this process (module loader hooks, a patched build, the inspector, …; A-1).

import { REDACTED } from "../fairness";
import { RoundScript as RoundScriptExport } from "../round/round-script";
import { SchedulerError } from "./events";

/** R-1: bound once, as this module loads (a later replacement of the export is never reached). */
const RoundScript = RoundScriptExport;
type RoundScript = RoundScriptExport;

/** The approved public metadata an admission decision may read. */
export interface AdmissionMetadata {
  readonly chainId: string;
  readonly chainIndex: number;
  readonly fv: number;
  readonly scriptVersion: number;
  readonly status: string;
}

export type SealedState = "sealed" | "opened" | "discarded";

const INSPECT = Symbol.for("nodejs.util.inspect.custom");
const CONSTRUCT = Symbol("SealedRound.construct");
/** Module-private: the opening capability (set by the static block below). */
let opener: ((sealed: unknown) => RoundScript) | null = null;
let openerClaimed = false;
/** Module-private: the source sealing capability (set by the static block below; R-1). */
let sourceSealing: SourceSealing | null = null;
let sourceSealingClaimed = false;

/** The source's capability (R-1): seals bound to one source, and the check of that binding. */
export interface SourceSealing {
  /** Seals a verified script for `origin`, the one source that may deliver it. */
  readonly seal: (script: RoundScript, origin: object) => SealedRound;
  /** True only for an UNOPENED seal that `seal` made for exactly `origin`. */
  readonly sealedBy: (sealed: unknown, origin: object) => boolean;
}

export class SealedRound {
  readonly admission: AdmissionMetadata;
  #script: RoundScript | null;
  #state: SealedState = "sealed";
  /** R-1: the source this seal was made for; null for a test seal (`sealRoundScript`). */
  #origin: object | null = null;

  /** Use `sealRoundScript`. */
  private constructor(token: symbol, script: RoundScript) {
    if (token !== CONSTRUCT) throw new SchedulerError("sealed-misuse", "construction-refused");
    const p = script.public;
    this.admission = Object.freeze({
      chainId: p.chainId,
      chainIndex: p.chainIndex,
      fv: p.fv,
      scriptVersion: p.scriptVersion,
      status: p.status,
    });
    this.#script = script;
    Object.seal(this);
  }

  static {
    // The brand check (`#state in`) cannot be fooled by a prototype or a Proxy, unlike instanceof.
    opener = (sealed: unknown): RoundScript => {
      if (typeof sealed !== "object" || sealed === null || !(#state in sealed)) {
        throw new SchedulerError("sealed-misuse", "not-sealed");
      }
      const s = sealed as SealedRound;
      if (s.#state !== "sealed" || s.#script === null) {
        throw new SchedulerError("sealed-misuse", `already-${s.#state}`);
      }
      const script = s.#script;
      s.#script = null;
      s.#state = "opened";
      return script;
    };
    sourceSealing = Object.freeze({
      seal: (script: RoundScript, origin: object): SealedRound => {
        if (typeof origin !== "object" || origin === null) {
          throw new SchedulerError("sealed-misuse", "invalid-origin");
        }
        const sealed = SealedRound.#make(script);
        sealed.#origin = origin;
        return sealed;
      },
      sealedBy: (sealed: unknown, origin: object): boolean =>
        typeof sealed === "object" &&
        sealed !== null &&
        #origin in sealed &&
        typeof origin === "object" &&
        origin !== null &&
        (sealed as SealedRound).#origin === origin &&
        (sealed as SealedRound).#state === "sealed",
    });
  }

  static #make(script: unknown): SealedRound {
    if (!(script instanceof RoundScript)) throw new SchedulerError("sealed-misuse", "not-a-script");
    return new SealedRound(CONSTRUCT, script);
  }

  /** A TEST seal, bound to no source (the driver never admits it): see `sealRoundScript`. */
  static seal(script: unknown): SealedRound {
    return SealedRound.#make(script);
  }

  get state(): SealedState {
    return this.#state;
  }

  /** Drops a script that will never be played; it is never opened. Idempotent. */
  discard(): void {
    if (this.#state !== "sealed") return;
    this.#script = null;
    this.#state = "discarded";
  }

  toJSON(): AdmissionMetadata & { state: SealedState; secret: string } {
    return { ...this.admission, state: this.#state, secret: REDACTED };
  }

  toString(): string {
    return `SealedRound(chain index ${this.admission.chainIndex}, ${this.#state}) ${REDACTED}`;
  }

  [INSPECT](): string {
    return this.toString();
  }
}

/**
 * A TEST seal of a RoundScript, bound to no source: the pure core (and its tests) accepts it, the
 * driver (scheduler.ts) never does (R-1). The source seals with `claimSourceSealing()`.
 */
export const sealRoundScript = (script: RoundScript): SealedRound => SealedRound.seal(script);

/**
 * INTERNAL to the scheduler: returns the opening capability exactly ONCE per module instance
 * (disclosure.ts claims it as it loads; see the file comment). Every later call is refused.
 */
export function claimSealedRoundOpener(): (sealed: SealedRound) => RoundScript {
  if (openerClaimed || opener === null) throw new SchedulerError("sealed-misuse", "opener-claimed");
  openerClaimed = true;
  const open = opener;
  opener = null;
  return (sealed: SealedRound) => open(sealed);
}

/**
 * INTERNAL to the scheduler (R-1): returns the source sealing capability exactly ONCE per module
 * instance (source.ts claims it as it loads; see the file comment). Every later call is refused,
 * and a source module that finds it claimed fails to load (fail closed).
 */
export function claimSourceSealing(): SourceSealing {
  if (sourceSealingClaimed || sourceSealing === null) {
    throw new SchedulerError("sealed-misuse", "sealing-claimed");
  }
  sourceSealingClaimed = true;
  const sealing = sourceSealing;
  sourceSealing = null;
  return sealing;
}

// R-1: nothing of this module can be replaced once it has loaded. The compiled build's CommonJS
// exports object is frozen too (an ES module namespace, as under Vitest, is immutable already).
Object.freeze(SealedRound);
Object.freeze(SealedRound.prototype);
if (typeof module === "object" && module !== null) Object.freeze(module.exports);
