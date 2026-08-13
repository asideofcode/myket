/** Sampled cat sounds (public/sounds). Mute via localStorage. */

const PURR_URL = "/sounds/purr.mp3";
const MEOW_URL = "/sounds/meow.mp3";

let muted =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("myket.mute") === "1";

let active: HTMLAudioElement | null = null;

function stopActive() {
  if (!active) return;
  try {
    active.pause();
    active.currentTime = 0;
  } catch {
    /* ignore */
  }
  active = null;
}

function playUrl(
  url: string,
  volume: number,
  opts?: { maxMs?: number },
): Promise<void> {
  if (muted) return Promise.resolve();
  stopActive();
  const a = new Audio(url);
  a.volume = volume;
  active = a;

  const done = a.play().catch(() => {
    /* autoplay / missing file */
  });

  if (opts?.maxMs != null) {
    const maxMs = opts.maxMs;
    window.setTimeout(() => {
      if (active !== a) return;
      const step = () => {
        if (active !== a) return;
        a.volume = Math.max(0, a.volume - 0.07);
        if (a.volume <= 0.02) {
          stopActive();
          return;
        }
        window.setTimeout(step, 40);
      };
      step();
    }, maxMs);
  }

  a.addEventListener(
    "ended",
    () => {
      if (active === a) active = null;
    },
    { once: true },
  );

  return done.then(() => undefined);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  if (on) stopActive();
  try {
    localStorage.setItem("myket.mute", on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/**
 * Pet purr. Short teaser on a single pet; full rumble after a little streak.
 */
export function playPurr(full = false): Promise<void> {
  return playUrl(PURR_URL, full ? 0.58 : 0.45, full ? undefined : { maxMs: 1100 });
}

/** Occasional ambient meow. Skips if a purr is already going. */
export function playMeow(): Promise<void> {
  if (muted) return Promise.resolve();
  if (active && !active.paused && active.src.includes("purr")) {
    return Promise.resolve();
  }
  return playUrl(MEOW_URL, 0.5);
}
