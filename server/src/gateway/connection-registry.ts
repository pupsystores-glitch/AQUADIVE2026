// Live WebSocket connections and their bounds (P8-2).
//
// Two limits: all connections, and connections per remote address, so one
// host cannot take every slot. `check` runs at the HTTP upgrade (an over-limit
// request gets HTTP 503 and never becomes a WebSocket); `add` checks again
// when the socket exists, because several upgrades can pass `check` at once.

export type Admission = "ok" | "server-full" | "address-full";

export class ConnectionRegistry<C> {
  private readonly all = new Set<C>();
  private readonly byAddress = new Map<string, number>();

  constructor(
    private readonly maxTotal: number,
    private readonly maxPerAddress: number,
  ) {}

  get size(): number {
    return this.all.size;
  }

  /** Whether one more connection from `address` fits. */
  check(address: string): Admission {
    if (this.all.size >= this.maxTotal) return "server-full";
    if ((this.byAddress.get(address) ?? 0) >= this.maxPerAddress) return "address-full";
    return "ok";
  }

  /** Register a connection if it fits; false (and nothing registered) otherwise. */
  add(address: string, connection: C): boolean {
    if (this.all.has(connection) || this.check(address) !== "ok") return false;
    this.all.add(connection);
    this.byAddress.set(address, (this.byAddress.get(address) ?? 0) + 1);
    return true;
  }

  /** Unregister a connection (idempotent). */
  remove(address: string, connection: C): void {
    if (!this.all.delete(connection)) return;
    const left = (this.byAddress.get(address) ?? 1) - 1;
    if (left > 0) this.byAddress.set(address, left);
    else this.byAddress.delete(address);
  }

  /** Per-address entries currently tracked (for leak tests). */
  get addressCount(): number {
    return this.byAddress.size;
  }

  /** A copy of the live connections (safe to iterate while they close). */
  snapshot(): C[] {
    return [...this.all];
  }
}
