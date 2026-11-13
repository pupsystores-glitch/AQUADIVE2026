// Test-only replacement for @/ui/session (Sprint 4, Commit U3). Registered
// by bootScreen() (dom-harness.tsx) via vi.doMock on every boot.
//
// Everything is the actual module except `gameSession`, which becomes the
// scripted session armed by bootScreen() (see scripted-session.ts). The
// production singleton is still constructed by the actual module; it is
// inert (no rAF, no DOM; docs/07 §8) and unused.

import { vi } from "vitest";
import type * as SessionModule from "@/ui/session";
import { buildArmedSession } from "./scripted-session";

const actual = await vi.importActual<typeof SessionModule>("@/ui/session");

export const createGameSession = actual.createGameSession;
export const gameSession = buildArmedSession(actual.createGameSession);
export type * from "@/ui/session";
