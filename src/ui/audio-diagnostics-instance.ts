// IOS-AUDIO (temporary): the one audio diagnostics recorder of the page.
//
// Created only in DEV builds, on the client, with `?audiodebug=1` in the URL;
// `null` otherwise. Production builds fold it to `null` and drop the
// recorder. The production session (src/ui/session.ts) passes its seams to
// the audio host, and the dev panel (DevAudioDiagnostics) reads it. It is a
// module of its own so the panel never imports the session.

import {
  audioDiagnosticsEnabled,
  createAudioDiagnostics,
  type AudioDiagnostics,
} from "@/ui/audio-diagnostics";

export const audioDiagnostics: AudioDiagnostics | null =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  audioDiagnosticsEnabled(window.location?.search)
    ? createAudioDiagnostics()
    : null;
