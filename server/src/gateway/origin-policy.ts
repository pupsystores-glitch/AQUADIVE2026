// WebSocket Origin policy (P8-2; docs/09 §9.3, §24 cross-site WebSocket hijacking).
//
// Restrictive by default: an upgrade is allowed only when its `Origin` header
// equals one of the configured origins exactly. A missing, empty, repeated or
// `null` origin is refused, and so is everything when the list is empty (the
// default). No wildcards, no suffix or prefix matching.
//
// The Origin check protects browsers from cross-site use of the socket. A
// non-browser client can send any header it likes, so this is not
// authentication.

export class OriginPolicy {
  private readonly allowed: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    this.allowed = new Set(allowedOrigins);
  }

  /** True iff the upgrade request's Origin header value is allowed. */
  allows(origin: string | string[] | undefined): boolean {
    return typeof origin === "string" && this.allowed.has(origin);
  }
}
