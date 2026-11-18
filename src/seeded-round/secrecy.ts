// Redaction controls of the seeded round binding (P8-3b; owner decision D-B4).
//
// Before the round's reveal, every outcome-relevant fact is SECRET: the seed and blocks, the
// drawn values, the outcomes, and every purpose's draw count (one crash draw means a 1.00×
// crash; the world draw count tracks the dive length). The binding's objects keep those in
// private fields and serialize to public facts only, so JSON.stringify, String(), template
// literals and Node's util.inspect of a round, its authority, its streams or of a GameEngine
// holding them never show them. This is defense in depth against accidental disclosure, not
// protection against memory inspection or a caller that deliberately reads the secret accessors.

import { REDACTED } from "@/fairness";

/** Node's util.inspect hook (a registered symbol; no Node import). */
export const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/** What a sealed value shows instead of its content (shared with src/fairness). */
export const SEALED = REDACTED;
