// LA1: the one startup controller of the page, wired to the production game
// session and the renderer's image loader. Module scope, like the session:
// SSR-safe (construction reads nothing; `begin()` runs on the client), and a
// remount of the screen never restarts loading or shows it again once the
// game is playing. A module of its own so the startup logic in
// `./startup.ts` stays free of singletons and testable.

import { assets } from "@/rendering/assets";
import { gameSession } from "@/ui/session";
import { createStartup } from "@/ui/startup";

export const gameStartup = createStartup({
  images: assets,
  audio: gameSession.audio,
  whenFrameRendered: gameSession.whenFrameRendered,
});
