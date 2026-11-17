import { createFileRoute } from "@tanstack/react-router";
import GameScreen from "@/ui/components/GameScreen";
import { LoadingScreen } from "@/ui/components/LoadingScreen";
import { useStore } from "@/ui/hooks/use-store";
import { gameStartup } from "@/ui/startup-instance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AQUADIVE — Real-Time Crash Game" },
      {
        name: "description",
        content:
          "AQUADIVE — plunge into the deep, ride the multiplier, and cash out before the chain snaps. A real-time ocean crash game.",
      },
      { property: "og:title", content: "AQUADIVE — Real-Time Crash Game" },
      {
        property: "og:description",
        content: "Plunge into the deep, ride the multiplier, cash out before the chain snaps.",
      },
    ],
  }),
  component: Index,
});

// LA1: the game mounts at once (its canvas renders the first frame under the
// loading screen) but stays `inert` — no focus, no input, hidden from
// assistive technology — until the player has pressed START GAME.
function Index() {
  const playing = useStore(gameStartup, (s) => s.phase === "playing");
  return (
    <>
      <div inert={!playing}>
        <GameScreen />
      </div>
      <LoadingScreen />
    </>
  );
}
