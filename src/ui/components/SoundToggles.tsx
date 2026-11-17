// SOUND and MUSIC buttons — the two audio switches under the balance (LA1,
// owner design decision 2026-11-17; docs/07 §24).
//
// SOUND (speaker): every effect and both ocean ambience beds. MUSIC (note):
// the soundtrack only. Each button flips its own switch in the session's
// sound settings store (`toggleSwitch`), which persists it; the audio host
// applies it synchronously, inside the press, so iOS accepts the resume and
// the soundtrack's play() it causes. A button shows ON only while its switch
// is on and the master mute is off (`switchShown`), so it never claims a
// sound that cannot play.
//
// Icon-only, with an accessible name and `aria-pressed`; native buttons, so
// Enter and Space work; a visible focus ring. 28 px visually, with a 36 × 44
// px touch target from an invisible `before:` box (Apple's 44 pt height),
// spaced so the two targets never overlap. Lucide icons (already a project
// dependency); no image assets. Reads only the two switches and the mute,
// so nothing else re-renders it (V3).

import { Music, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/ui/hooks/use-store";
import { gameSession } from "@/ui/session";
import { switchShown } from "@/ui/store/sound-settings-store";
import { STRINGS } from "@/ui/strings";

const { soundSettings } = gameSession;

function AudioToggle({
  on,
  label,
  title,
  onPress,
  children,
}: {
  on: boolean;
  label: string;
  title: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={title}
      onClick={onPress}
      className={
        "relative grid h-7 w-7 touch-manipulation place-items-center rounded-full border transition-colors" +
        " before:absolute before:-inset-x-1 before:-inset-y-2 before:content-['']" +
        " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70" +
        (on
          ? " border-gold/40 bg-card/70 text-gold hover:bg-card"
          : " border-border bg-card/40 text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

export function SoundToggles() {
  const soundOn = useStore(soundSettings, (s) => switchShown(s, "soundOn"));
  const musicOn = useStore(soundSettings, (s) => switchShown(s, "musicOn"));
  const { audioControls } = STRINGS;

  return (
    <div role="group" aria-label={audioControls.groupLabel} className="flex items-center gap-2">
      <AudioToggle
        on={soundOn}
        label={audioControls.sound}
        title={audioControls.soundTitle(soundOn)}
        onPress={() => soundSettings.toggleSwitch("soundOn")}
      >
        {soundOn ? (
          <Volume2 aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : (
          <VolumeX aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
      </AudioToggle>
      <AudioToggle
        on={musicOn}
        label={audioControls.music}
        title={audioControls.musicTitle(musicOn)}
        onPress={() => soundSettings.toggleSwitch("musicOn")}
      >
        <Music aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} />
        {!musicOn && (
          // The muted note: a diagonal stroke across the icon (Lucide has no "music off").
          <span
            aria-hidden
            className="pointer-events-none absolute h-[1.5px] w-4 rotate-45 rounded-full bg-current"
          />
        )}
      </AudioToggle>
    </div>
  );
}
