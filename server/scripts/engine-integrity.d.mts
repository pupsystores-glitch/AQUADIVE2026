// Types of scripts/engine-integrity.mjs (P8-4a-1), for the server's tests.

export declare const SERVER_DIR: string;
export declare const TRUSTED_MANIFEST: string;
export declare const SCHEMA: string;
export declare const SCHEMA_VERSION: number;
export declare const PROTECTED_DIRECTORIES: readonly string[];
export declare const PROTECTED_SINGLE_FILES: readonly string[];
export declare const PROTECTED_PATH: RegExp;

/** Protected files of a build, sorted; throws on links, non-regular entries and odd names. */
export declare function listProtectedFiles(dist: string): string[];
/** The build's manifest in canonical text. */
export declare function candidateManifestText(dist: string): string;
/** Problems of `dist` against the trusted manifest (empty = the build matches). */
export declare function verifyAgainstTrusted(dist: string, trustedPath?: string): string[];
