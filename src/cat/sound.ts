/** Tiny procedural purr via Web Audio — no asset file required. */

let muted =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("myagent.mute") === "1";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(on: boolean) {
  muted = on;
  try {
    localStorage.setItem("myagent.mute", on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function toggleMute(): boolean {
  setMuted(!muted);
  return muted;
}

/** Soft rumble burst for petting. */
export async function playPurr(durationMs = 420): Promise<void> {
  if (muted) return;
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") {
    try {
      await ac.resume();
    } catch {
      return;
    }
  }

  const now = ac.currentTime;
  const dur = durationMs / 1000;

  // Low oscillator = purr body
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(42, now);
  osc.frequency.exponentialRampToValueAtTime(28, now + dur);

  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 12;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 180;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);

  osc.start(now);
  lfo.start(now);
  osc.stop(now + dur + 0.02);
  lfo.stop(now + dur + 0.02);
}
