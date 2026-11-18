// Process readiness (P8-2; docs/09 §23.4).
//
// "Ready" here means only that the process accepts new WebSocket connections.
// There is no database, round or authority yet, so readiness says nothing
// about them. Once shutdown begins the process is draining: readiness turns
// false and stays false, and the gateway refuses new connections.

export class Readiness {
  private draining = false;

  /** True until shutdown begins. */
  get ready(): boolean {
    return !this.draining;
  }

  /** Enter the draining state (idempotent, irreversible). */
  markDraining(): void {
    this.draining = true;
  }
}
