/** In-memory affection — M2 only; SQLite comes in M4. */

export type MoodKind = "happy" | "content" | "neglected" | "mad";

const NEGLECT_MS = 45_000; // short for demo; later ~hours
const MAD_MS = 90_000;
const PET_COOLDOWN_MS = 900;
const PET_BOOST = 18;
const MAX_AFFECTION = 100;

export class Mood {
  affection = 55;
  lastPetAt = performance.now();
  private lastPetAttempt = 0;

  /** @returns true if pet counted (not on cooldown) */
  tryPet(nowMs: number): boolean {
    if (nowMs - this.lastPetAttempt < PET_COOLDOWN_MS) return false;
    this.lastPetAttempt = nowMs;
    this.lastPetAt = nowMs;
    this.affection = Math.min(MAX_AFFECTION, this.affection + PET_BOOST);
    return true;
  }

  kind(nowMs: number): MoodKind {
    const neglectedFor = nowMs - this.lastPetAt;
    if (neglectedFor >= MAD_MS || this.affection < 20) return "mad";
    if (neglectedFor >= NEGLECT_MS || this.affection < 40) return "neglected";
    if (this.affection >= 75) return "happy";
    return "content";
  }

  /** Soft decay while ignored — call from the game loop. */
  tick(nowMs: number, dtMs: number) {
    const neglectedFor = nowMs - this.lastPetAt;
    if (neglectedFor > NEGLECT_MS) {
      this.affection = Math.max(0, this.affection - (dtMs / 1000) * 0.8);
    }
  }
}

const HAPPY = [
  "mrrp.",
  "you may continue existing.",
  "petting accepted. for now.",
  "warm. good human.",
  "i supposed that was fine.",
];

const CONTENT = [
  "…yes?",
  "watching you work. judging lightly.",
  "food? no? okay.",
  "the void stares back. also me.",
  "hm.",
];

const NEGLECTED = [
  "oh NOW you talk.",
  "interesting. no pets for ages.",
  "i've been right here.",
  "bold of you to speak first.",
  "…ignored me. noted.",
];

const MAD = [
  "absolutely not.",
  "pet me or suffer the silence.",
  "i contain multitudes. mostly resentment.",
  "talk is cheap. paws are free.",
  "do i LOOK entertained?",
];

export function stubReply(userText: string, mood: MoodKind): string {
  const t = userText.trim().toLowerCase();
  if (!t) return "…";

  if (/\b(pet|scratch|love|sorry)\b/.test(t)) {
    if (mood === "mad" || mood === "neglected") {
      return "actions > words. try clicking me.";
    }
    return "already ahead of you. click is faster.";
  }
  if (/\b(hi|hello|hey)\b/.test(t)) {
    if (mood === "mad") return "hi? that's it?";
    if (mood === "neglected") return "…hey. took you long enough.";
    return "mrrp. hello.";
  }
  if (/\b(food|treat|tuna|snack)\b/.test(t)) {
    return mood === "mad" ? "bribery noted. insufficient." : "lead with tuna next time.";
  }
  if (/\b(who are you|name|what are you)\b/.test(t)) {
    return "desktop cat. temporary god. myagent.";
  }

  const pool =
    mood === "happy"
      ? HAPPY
      : mood === "mad"
        ? MAD
        : mood === "neglected"
          ? NEGLECTED
          : CONTENT;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
