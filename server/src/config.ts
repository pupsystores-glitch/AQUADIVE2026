// Server configuration from environment variables (P8-2).
//
// Every setting has a safe default: bound to loopback, no browser origin
// allowed, bounded connections, a 5 s hello timeout and the docs/09 §9.5 frame
// rate (30 / s, burst 60). Validation never echoes a value back (an operator
// may paste a secret into the wrong variable), only the variable name and the
// kind of problem. Unknown `AQUADIVE_*` variables are rejected so that a typo
// cannot silently fall back to a default.

import { isIP } from "node:net";
import { z } from "zod";

/**
 * The tick rate announced in `welcome`. The engine advances at a fixed 60 Hz
 * (`TICK_SECONDS = 1 / 60`, docs/06); the gateway does not import the engine
 * (docs/09 §6.3), so the value is stated here once and is not configurable.
 * A test checks it against the protocol's `MAX_TICK_HZ`.
 */
export const SERVER_TICK_HZ = 60;

export const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly logLevel: LogLevel;
  /** Exact browser origins allowed to open the WebSocket; empty = none. */
  readonly allowedOrigins: readonly string[];
  readonly maxConnections: number;
  readonly maxConnectionsPerIp: number;
  readonly helloTimeoutMs: number;
  readonly messageRatePerSecond: number;
  readonly messageBurst: number;
  readonly heartbeatIntervalMs: number;
  readonly shutdownGraceMs: number;
  readonly tickHz: number;
}

/** Environment variable for each setting. */
export const ENV = {
  host: "AQUADIVE_SERVER_HOST",
  port: "AQUADIVE_SERVER_PORT",
  allowNonLoopback: "AQUADIVE_SERVER_ALLOW_NON_LOOPBACK",
  logLevel: "AQUADIVE_LOG_LEVEL",
  allowedOrigins: "AQUADIVE_WS_ALLOWED_ORIGINS",
  maxConnections: "AQUADIVE_WS_MAX_CONNECTIONS",
  maxConnectionsPerIp: "AQUADIVE_WS_MAX_CONNECTIONS_PER_IP",
  helloTimeoutMs: "AQUADIVE_WS_HELLO_TIMEOUT_MS",
  messageRatePerSecond: "AQUADIVE_WS_MESSAGE_RATE_PER_SECOND",
  messageBurst: "AQUADIVE_WS_MESSAGE_BURST",
  heartbeatIntervalMs: "AQUADIVE_WS_HEARTBEAT_INTERVAL_MS",
  shutdownGraceMs: "AQUADIVE_SHUTDOWN_GRACE_MS",
} as const;

const ENV_PREFIX = "AQUADIVE_";
const KNOWN_ENV: ReadonlySet<string> = new Set(Object.values(ENV));

export const DEFAULTS = {
  host: "127.0.0.1",
  port: 8790,
  logLevel: "info",
  maxConnections: 1000,
  maxConnectionsPerIp: 32,
  helloTimeoutMs: 5000,
  messageRatePerSecond: 30,
  messageBurst: 60,
  heartbeatIntervalMs: 10_000,
  shutdownGraceMs: 10_000,
} as const;

/** True iff `host` can only be reached from this machine. */
export function isLoopbackHost(host: string): boolean {
  if (host === "localhost" || host === "::1") return true;
  return isIP(host) === 4 && host.startsWith("127.");
}

/** True iff `origin` is a canonical http(s) origin (`scheme://host[:port]`, nothing else). */
export function isCanonicalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === origin;
  } catch {
    return false;
  }
}

const integer = (min: number, max: number, fallback: number) =>
  z
    .string()
    .regex(/^(0|[1-9][0-9]{0,8})$/, "not a canonical non-negative integer")
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .optional()
    .transform((n) => n ?? fallback);

const EnvSchema = z
  .object({
    [ENV.host]: z
      .string()
      .refine((h) => h === "localhost" || isIP(h) !== 0, "not an IP address or localhost")
      .optional()
      .transform((h) => h ?? DEFAULTS.host),
    [ENV.port]: integer(0, 65_535, DEFAULTS.port),
    [ENV.allowNonLoopback]: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),
    [ENV.logLevel]: z
      .enum(LOG_LEVELS)
      .optional()
      .transform((v) => v ?? DEFAULTS.logLevel),
    [ENV.allowedOrigins]: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
      )
      .pipe(z.array(z.string().refine(isCanonicalOrigin, "not a canonical http(s) origin"))),
    [ENV.maxConnections]: integer(1, 100_000, DEFAULTS.maxConnections),
    [ENV.maxConnectionsPerIp]: integer(1, 100_000, DEFAULTS.maxConnectionsPerIp),
    [ENV.helloTimeoutMs]: integer(50, 60_000, DEFAULTS.helloTimeoutMs),
    [ENV.messageRatePerSecond]: integer(1, 1000, DEFAULTS.messageRatePerSecond),
    [ENV.messageBurst]: integer(1, 10_000, DEFAULTS.messageBurst),
    [ENV.heartbeatIntervalMs]: integer(50, 300_000, DEFAULTS.heartbeatIntervalMs),
    [ENV.shutdownGraceMs]: integer(0, 120_000, DEFAULTS.shutdownGraceMs),
  })
  .superRefine((env, ctx) => {
    if (!env[ENV.allowNonLoopback] && !isLoopbackHost(env[ENV.host])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [ENV.host],
        message: `not a loopback address (set ${ENV.allowNonLoopback}=true to bind it)`,
      });
    }
    if (env[ENV.maxConnectionsPerIp] > env[ENV.maxConnections]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [ENV.maxConnectionsPerIp],
        message: `greater than ${ENV.maxConnections}`,
      });
    }
    if (env[ENV.messageBurst] < env[ENV.messageRatePerSecond]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [ENV.messageBurst],
        message: `smaller than ${ENV.messageRatePerSecond}`,
      });
    }
  });

/**
 * Issue messages that never contain the received value. Messages written in
 * the schema above take precedence; zod's own default for an enum mismatch
 * would quote the input, so every remaining case is described by kind only.
 */
const valueFreeMessage: z.ZodErrorMap = (issue) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `expected one of ${issue.options.join(", ")}` };
    case z.ZodIssueCode.too_small:
      return { message: `below the minimum ${String(issue.minimum)}` };
    case z.ZodIssueCode.too_big:
      return { message: `above the maximum ${String(issue.maximum)}` };
    default:
      return { message: issue.code };
  }
};

export type ConfigResult =
  | { readonly ok: true; readonly config: ServerConfig }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Parse and validate the environment. Never throws; errors never contain values. */
export function parseConfig(env: Readonly<Record<string, string | undefined>>): ConfigResult {
  const unknown = Object.keys(env)
    .filter((k) => k.startsWith(ENV_PREFIX) && !KNOWN_ENV.has(k))
    .sort();
  if (unknown.length > 0) {
    return { ok: false, errors: unknown.map((k) => `${k}: unknown variable`) };
  }

  const known: Record<string, string> = {};
  for (const key of KNOWN_ENV) {
    const value = env[key];
    if (value !== undefined) known[key] = value;
  }

  const parsed = EnvSchema.safeParse(known, { errorMap: valueFreeMessage });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "environment"}: ${i.message}`),
    };
  }

  const e = parsed.data;
  return {
    ok: true,
    config: {
      host: e[ENV.host],
      port: e[ENV.port],
      logLevel: e[ENV.logLevel],
      allowedOrigins: e[ENV.allowedOrigins],
      maxConnections: e[ENV.maxConnections],
      maxConnectionsPerIp: e[ENV.maxConnectionsPerIp],
      helloTimeoutMs: e[ENV.helloTimeoutMs],
      messageRatePerSecond: e[ENV.messageRatePerSecond],
      messageBurst: e[ENV.messageBurst],
      heartbeatIntervalMs: e[ENV.heartbeatIntervalMs],
      shutdownGraceMs: e[ENV.shutdownGraceMs],
      tickHz: SERVER_TICK_HZ,
    },
  };
}
