// What the P8-2 gateway does with valid requests other than `hello` (P8-2).
//
// P8-2 implements the handshake only. After `welcome`, every other client
// request is refused with an `error` frame that repeats its request id, before
// any processing: nothing is looked up, stored, forwarded or counted towards
// a round, wallet, ledger or identity. The connection stays open (a refused
// request is not a protocol fault).
//
// - `bet.place`, `bet.cashout`, `bonus.pick` → `auth-required`: money commands
//   need an authenticated session (docs/09 §9.1 step 5), and none can exist.
// - `auth.resume`, `sync.request`, `ping` → `server-busy`: the service is not
//   available on this server yet. Both codes are registered as "transient":
//   refused before processing, not stored, the same id may be resent.
//
// The registry has no dedicated "not available" code; adding one would be a
// further protocol change (owner decision). Identity is P8-8, resync P8-5/P8-6.

import type { ClientMessageType, ErrorCodeFor } from "../protocol";

export type RefusedRequestType = Exclude<ClientMessageType, "hello">;

export const REFUSALS: Readonly<Record<RefusedRequestType, ErrorCodeFor<"error">>> = {
  "bet.place": "auth-required",
  "bet.cashout": "auth-required",
  "bonus.pick": "auth-required",
  "auth.resume": "server-busy",
  "sync.request": "server-busy",
  ping: "server-busy",
};
