/**
 * Web MediaSession API wrappers.
 *
 * MediaSession exposes the playing track to the OS so it shows up on the lock
 * screen, in the notification shade, and on Bluetooth headphones' button
 * controls. The browser surfaces these affordances automatically once we
 * write metadata + register action handlers.
 *
 * Graceful no-op when navigator.mediaSession is unavailable (old browsers,
 * SSR, some iOS PWA configs).
 */

export interface MediaSessionTrack {
  title: string;
  artist: string | null;
  album: string | null;
  /** Already-resolved image URL (signed, base64 data: URL, or remote). */
  artworkUrl: string | null;
}

export interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSeekTo?: (positionSec: number) => void;
  onSeekBackward?: (offsetSec: number) => void;
  onSeekForward?: (offsetSec: number) => void;
  onStop?: () => void;
}

function available(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}

/** Write the current track's metadata to the OS media controls. */
export function setMediaMetadata(track: MediaSessionTrack | null): void {
  if (!available()) return;
  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist ?? undefined,
    album: track.album ?? undefined,
    artwork: track.artworkUrl
      ? [
          { src: track.artworkUrl, sizes: "512x512", type: "image/jpeg" },
          { src: track.artworkUrl, sizes: "256x256", type: "image/jpeg" },
        ]
      : [],
  });
}

/**
 * Bind transport action handlers. Re-registering is idempotent — browsers
 * replace the previous handler for each action type.
 */
export function bindMediaActions(handlers: MediaSessionHandlers): void {
  if (!available()) return;
  const set = (action: MediaSessionAction, fn: (() => void) | undefined) => {
    try {
      navigator.mediaSession.setActionHandler(action, fn ? () => fn() : null);
    } catch {
      /* not supported on this UA */
    }
  };
  set("play", handlers.onPlay);
  set("pause", handlers.onPause);
  set("previoustrack", handlers.onPrev);
  set("nexttrack", handlers.onNext);
  set("stop", handlers.onStop);

  if (handlers.onSeekBackward) {
    try {
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        handlers.onSeekBackward!(details.seekOffset ?? 10);
      });
    } catch { /* unsupported */ }
  }
  if (handlers.onSeekForward) {
    try {
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        handlers.onSeekForward!(details.seekOffset ?? 10);
      });
    } catch { /* unsupported */ }
  }
  if (handlers.onSeekTo) {
    try {
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) handlers.onSeekTo!(details.seekTime);
      });
    } catch { /* unsupported */ }
  }
}

/** Tell the OS the current playback position so the lock screen scrubber works. */
export function setMediaPosition(opts: {
  durationSec: number;
  positionSec: number;
  playbackRate?: number;
}): void {
  if (!available() || typeof navigator.mediaSession.setPositionState !== "function") return;
  if (!Number.isFinite(opts.durationSec) || opts.durationSec <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: opts.durationSec,
      position: Math.max(0, Math.min(opts.positionSec, opts.durationSec)),
      playbackRate: opts.playbackRate ?? 1,
    });
  } catch {
    /* invalid combination, ignore */
  }
}

export function setPlaybackState(state: "playing" | "paused" | "none"): void {
  if (!available()) return;
  navigator.mediaSession.playbackState = state;
}
