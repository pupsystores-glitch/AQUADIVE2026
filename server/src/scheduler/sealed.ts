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
// - JSON.stringify, String(), template literals and Node's util.inspect show the public metadata
//   and the redaction marker only. Defense in depth against accidental disclosure in logs and
//   errors, and against ORDINARY callers; NOT isolation from arbitrary privileged code running in
//   this process (module loader hooks, a patched build, the inspector, …; A-1).

import { REDACTED } from "../fairness";
import { RoundScript } from "../round/round-script";
import { SchedulerError } from "./events";

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

export class SealedRound {
  readonly admission: AdmissionMetadata;
  #script: RoundScript | null;
  #state: SealedState = "sealed";

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
  }

  /** @internal */
  static seal(script: unknown): SealedRound {
    if (!(script instanceof RoundScript)) throw new SchedulerError("sealed-misuse", "not-a-script");
    return new SealedRound(CONSTRUCT, script);
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

/** Seals a verified RoundScript (the source does this on receipt). */
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
