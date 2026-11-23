// Types of scripts/build-engine.mjs (P8-4-0), for the server's tests.

export declare const SERVER_DIR: string;
export declare const REPO_DIR: string;
export declare const ENGINE_ENTRY: string;
export declare const ENGINE_BUNDLE: string;
export declare const FAIRNESS_REQUIRE: string;

export interface EngineBundleOptions {
  /** Server build directory (default server/dist). */
  readonly dist?: string;
  /** Entry file, or a name → file map (default engine/entry.ts). */
  readonly input?: string | Readonly<Record<string, string>>;
  /** Output file relative to `dist` (single entry). */
  readonly file?: string;
  /** Output directory relative to `dist` (multiple entries). */
  readonly dir?: string;
  /** Extra external specifier → emitted require. */
  readonly external?: Readonly<Record<string, string>>;
  /** TEST-ONLY bundles: allow src/seeded-round/test/ helpers. */
  readonly allowTestModules?: boolean;
}

export interface EngineBundleChunk {
  readonly fileName: string;
  readonly code: string;
  /** Repository-relative module paths, sorted. */
  readonly modules: readonly string[];
  /** Every require() specifier in the emitted code. */
  readonly requires: readonly string[];
  readonly path: string;
}

/**
 * Builds one CommonJS bundle. A refusal rejects with an Error whose `problems` lists every
 * reason; any bundle at the target is removed first, so none remains after a failure.
 */
export declare function buildEngineBundle(
  options?: EngineBundleOptions,
): Promise<EngineBundleChunk[]>;

export interface EngineCodeValidation {
  /** Every reason the code is refused; empty when it is accepted. */
  readonly problems: readonly string[];
  /** Every literal require() specifier, in source order. */
  readonly requires: readonly string[];
}

/** Syntax-aware validation of emitted bundle code (P8-4-0 hardening, D-2). */
export declare function validateEngineCode(
  code: string,
  options?: { readonly fileName?: string; readonly allowedRequires?: Iterable<string> },
): EngineCodeValidation;
