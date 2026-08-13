import type { ClipName, SpriteAnimator } from "./sprites";
import { Mood, type MoodKind } from "./mood";
import {
  floorYFor,
  neighborInDir,
  sameScreen,
  screenAt,
  screenAtX,
  type ScreenRect,
} from "./monitors";

export type BehaviorState = "idle" | "walk" | "sit" | "purr";

const WALK_SPEED = 48;
/** Leisurely amble when curious about the cursor — not a dash. */
const FOLLOW_SPEED = 34;
const FOLLOW_NEAR = 56;
const FOLLOW_MAX_MS = 16_000;
const FOLLOW_COOLDOWN_MS = 22_000;
/** Chance, when picking a new action, to stroll toward the last-known cursor. */
const CURIOSITY_CHANCE = 0.22;

/**
 * Hitboxes in 128×128 sprite space (normalized to facing-right).
 * Head faces +x; back is striped torso; tail curls behind (−x).
 */
export function isHeadHit(
  localX: number,
  localY: number,
  facing: 1 | -1,
  frame = 128,
): boolean {
  const x = facing === 1 ? localX : frame - 1 - localX;
  return x >= 78 && x <= 114 && localY >= 16 && localY <= 70;
}

export function isBackHit(
  localX: number,
  localY: number,
  facing: 1 | -1,
  frame = 128,
): boolean {
  const x = facing === 1 ? localX : frame - 1 - localX;
  // Torso only — leave the far rear for the tail.
  return x >= 42 && x < 78 && localY >= 30 && localY <= 74;
}

export function isTailHit(
  localX: number,
  localY: number,
  facing: 1 | -1,
  frame = 128,
): boolean {
  const x = facing === 1 ? localX : frame - 1 - localX;
  // Raised / curled tail behind the body.
  return x >= 6 && x < 42 && localY >= 14 && localY <= 88;
}

export type CatHotspot = "head" | "back" | "tail" | null;

export function hotspotAt(
  localX: number,
  localY: number,
  facing: 1 | -1,
): CatHotspot {
  if (isHeadHit(localX, localY, facing)) return "head";
  if (isBackHit(localX, localY, facing)) return "back";
  if (isTailHit(localX, localY, facing)) return "tail";
  return null;
}

/** Positions are logical desktop pixels (LogicalPosition). */
export class CatBehavior {
  state: BehaviorState = "idle";
  x = 0;
  y = 0;
  readonly mood = new Mood();
  chatting = false;
  carrying = false;

  private stateUntil = 0;
  private winW = 128;
  private winH = 128;
  private screens: ScreenRect[] = [];
  private floorY = 0;
  private xFrac = 0;
  private locked = false;
  private followX: number | null = null;
  private lastCursorX: number | null = null;
  private lastCursorY: number | null = null;
  private followUntil = 0;
  private lastFollowEnd = 0;

  constructor(
    private animator: SpriteAnimator,
    nowMs: number,
  ) {
    this.schedule(nowMs);
  }

  setWindowSize(w: number, h: number) {
    this.winW = w;
    this.winH = h;
  }

  setScreens(screens: ScreenRect[]) {
    this.screens = screens;
    if (!screens.length || this.chatting || this.carrying) return;
    const s = this.currentScreen() ?? screens[0]!;
    this.snapToScreen(s, this.x);
  }

  placeNearBottom(screens: ScreenRect[]) {
    this.screens = screens;
    const s = screens[0];
    if (!s) return;
    this.floorY = floorYFor(s, this.winH);
    this.x = Math.round(s.x + s.width * 0.35);
    this.y = this.floorY;
    this.xFrac = 0;
    this.followX = null;
  }

  /** Force visible placement on a screen (recovery / startup). */
  goHome(screen: ScreenRect) {
    this.screens = this.screens.length ? this.screens : [screen];
    this.followX = null;
    this.carrying = false;
    this.locked = false;
    this.chatting = false;
    this.floorY = floorYFor(screen, this.winH);
    this.x = Math.round(screen.x + screen.width * 0.4);
    this.y = this.floorY;
    this.xFrac = 0;
    this.state = "idle";
    this.animator.setClip("idle", true);
  }

  footY(): number {
    return this.y + this.winH;
  }

  setWindowBottom(footY: number) {
    this.floorY = Math.round(footY - this.winH);
    this.y = this.floorY;
  }

  moodKind(nowMs: number): MoodKind {
    return this.mood.kind(nowMs);
  }

  pet(nowMs: number): boolean {
    if (this.carrying) return false;
    if (!this.mood.tryPet(nowMs)) return false;
    this.followX = null;
    this.locked = true;
    this.chatting = false;
    this.enter("purr", nowMs);
    // After a short petting streak, settle into a longer purr.
    if (this.mood.petStreak >= 2) {
      this.stateUntil = nowMs + 5200 + Math.random() * 1200;
    }
    return true;
  }

  /** True once the cat is enjoying a sustained petting streak. */
  isFullPurr(): boolean {
    return this.mood.petStreak >= 2;
  }

  beginCarry(nowMs: number) {
    if (this.chatting) return;
    this.carrying = true;
    this.followX = null;
    this.locked = true;
    this.enter("sit", nowMs);
    this.stateUntil = nowMs + 86_400_000;
  }

  /** Free-move while held (logical desktop coords of window top-left). */
  setCarryPosition(x: number, y: number) {
    if (!this.carrying) return;
    this.x = Math.round(x);
    this.y = Math.round(y);
    this.xFrac = 0;
  }

  endCarry(nowMs: number) {
    if (!this.carrying) return;
    this.carrying = false;
    this.locked = false;
    this.followX = null;

    const cx = this.x + this.winW / 2;
    const cy = this.y + this.winH / 2;
    const s =
      screenAt(this.screens, cx, cy) ??
      screenAtX(this.screens, cx, cy) ??
      this.screens[0];
    if (s) {
      this.x = Math.round(
        clamp(this.x, s.x, s.x + s.width - this.winW),
      );
      this.floorY = floorYFor(s, this.winH);
      this.y = this.floorY;
    }
    this.enter("sit", nowMs);
    this.stateUntil = nowMs + 900 + Math.random() * 700;
  }

  setChatting(on: boolean, nowMs: number) {
    this.chatting = on;
    this.followX = null;
    if (on) {
      this.locked = true;
      this.enter("sit", nowMs);
      this.stateUntil = nowMs + 60_000;
    } else if (this.state !== "purr") {
      this.locked = false;
      this.enter("idle", nowMs);
    }
  }

  /** Keep a soft memory of where the user is; only chase when already curious. */
  noticeUserAt(cursorX: number, cursorY: number, nowMs: number) {
    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;
    if (
      this.carrying ||
      this.followX === null ||
      this.chatting ||
      this.state === "purr"
    ) {
      return;
    }
    this.refreshFollowTarget(nowMs, /*allowHop*/ false);
  }

  private cursorTargetX(userScreen: ScreenRect): number {
    return Math.round(
      clamp(
        (this.lastCursorX ?? userScreen.x) - this.winW / 2,
        userScreen.x,
        userScreen.x + userScreen.width - this.winW,
      ),
    );
  }

  private refreshFollowTarget(nowMs: number, allowHop: boolean) {
    if (this.lastCursorX === null || this.lastCursorY === null) return;
    if (!this.screens.length) return;

    const userScreen =
      screenAt(this.screens, this.lastCursorX, this.lastCursorY) ??
      screenAtX(this.screens, this.lastCursorX, this.lastCursorY);
    if (!userScreen) return;

    const targetX = this.cursorTargetX(userScreen);
    const catScreen = this.currentScreen();
    const switched = !catScreen || !sameScreen(catScreen, userScreen);

    if (switched) {
      if (!allowHop) return;
      this.snapToScreen(userScreen, targetX);
      this.followX = targetX;
      this.enter("sit", nowMs);
      this.stateUntil = nowMs + 900;
      this.locked = true;
      return;
    }

    if (Math.abs(targetX - this.x) < FOLLOW_NEAR) {
      this.stopFollow(nowMs, "sit");
      return;
    }

    this.followX = targetX;
    this.animator.setFacing(targetX >= this.x ? 1 : -1);
    this.ensureWalkAnim();
    this.locked = true;
    this.stateUntil = Math.max(this.stateUntil, this.followUntil);
  }

  private tryStartCuriousFollow(nowMs: number): boolean {
    if (this.chatting || this.state === "purr") return false;
    if (this.lastCursorX === null || this.lastCursorY === null) return false;
    if (nowMs - this.lastFollowEnd < FOLLOW_COOLDOWN_MS) return false;
    if (Math.random() >= CURIOSITY_CHANCE) return false;

    const userScreen =
      screenAt(this.screens, this.lastCursorX, this.lastCursorY) ??
      screenAtX(this.screens, this.lastCursorX, this.lastCursorY);
    if (!userScreen) return false;

    const targetX = this.cursorTargetX(userScreen);
    if (Math.abs(targetX - this.x) < FOLLOW_NEAR * 1.5) return false;

    this.followUntil = nowMs + FOLLOW_MAX_MS;
    this.refreshFollowTarget(nowMs, /*allowHop*/ true);
    return this.followX !== null || this.locked;
  }

  private stopFollow(nowMs: number, next: BehaviorState = "idle") {
    this.followX = null;
    this.locked = false;
    this.lastFollowEnd = nowMs;
    this.enter(next, nowMs);
  }

  update(nowMs: number, dtMs: number) {
    this.mood.tick(nowMs, dtMs);

    if (this.carrying) {
      this.animator.setClip("sit", false);
      this.animator.update(dtMs);
      return;
    }

    if (this.followX !== null && !this.chatting) {
      this.followStep(dtMs, nowMs);
    } else if (!this.chatting && nowMs >= this.stateUntil) {
      if (this.state === "purr") this.locked = false;
      if (!this.locked) this.pickNext(nowMs);
      else if (this.state === "purr") {
        this.locked = false;
        this.enter("idle", nowMs);
      }
    } else if (
      this.state === "walk" &&
      !this.chatting &&
      this.followX === null
    ) {
      this.walkStep(dtMs);
    }

    if (!this.chatting) {
      const s = this.currentScreen();
      if (s) this.floorY = floorYFor(s, this.winH);
      this.y = this.floorY;
    }

    this.animator.setClip(clipFor(this.state), false);
    this.animator.update(dtMs);
  }

  private snapToScreen(screen: ScreenRect, preferX: number) {
    this.floorY = floorYFor(screen, this.winH);
    this.x = Math.round(
      clamp(preferX, screen.x, screen.x + screen.width - this.winW),
    );
    this.y = this.floorY;
    this.xFrac = 0;
  }

  private followStep(dtMs: number, nowMs: number) {
    if (nowMs >= this.followUntil) {
      this.stopFollow(nowMs, Math.random() < 0.6 ? "sit" : "idle");
      return;
    }

    // Brief pause after a screen hop (or arrive sit) before walking again.
    if (this.state === "sit" && nowMs < this.stateUntil) return;

    // Softly retarget so the cat drifts toward where you are now, not a stale point.
    this.refreshFollowTarget(nowMs, /*allowHop*/ false);
    if (this.followX === null) return;

    const target = this.followX;
    const dir: 1 | -1 = target >= this.x ? 1 : -1;
    this.animator.setFacing(dir);
    this.ensureWalkAnim();

    this.xFrac += dir * FOLLOW_SPEED * (dtMs / 1000);
    const step =
      this.xFrac > 0 ? Math.floor(this.xFrac) : Math.ceil(this.xFrac);
    if (step !== 0) {
      this.x += step;
      this.xFrac -= step;
    }

    if (
      Math.abs(this.x - target) <= FOLLOW_NEAR ||
      (dir === 1 ? this.x >= target : this.x <= target)
    ) {
      this.x = Math.round(target);
      this.xFrac = 0;
      this.stopFollow(nowMs, "sit");
      this.stateUntil = nowMs + 1200 + Math.random() * 1800;
    }
  }

  private walkStep(dtMs: number) {
    const dir = this.animator.getFacing();
    this.xFrac += dir * WALK_SPEED * (dtMs / 1000);
    const step =
      this.xFrac > 0 ? Math.floor(this.xFrac) : Math.ceil(this.xFrac);
    if (step === 0) return;

    const prevX = this.x;
    this.x += step;
    this.xFrac -= step;

    const probeX = this.x + this.winW / 2;
    const probeY = this.floorY + this.winH - 8;
    const here = screenAt(this.screens, probeX, probeY);

    if (!here) {
      const from =
        screenAt(this.screens, prevX + this.winW / 2, probeY) ??
        screenAtX(this.screens, prevX + this.winW / 2, probeY);
      if (from) {
        const next = neighborInDir(this.screens, from, dir);
        if (next) {
          this.x =
            dir === 1
              ? Math.round(next.x + 4)
              : Math.round(next.x + next.width - this.winW - 4);
          this.floorY = floorYFor(next, this.winH);
          this.y = this.floorY;
          return;
        }
      }
      this.x = prevX;
      this.xFrac = 0;
      this.animator.setFacing(dir === 1 ? -1 : 1);
      return;
    }

    this.floorY = floorYFor(here, this.winH);
    const minX = Math.round(here.x);
    const maxX = Math.round(here.x + here.width - this.winW);

    if (this.x <= minX) {
      const next = neighborInDir(this.screens, here, -1);
      if (next) {
        this.x = Math.round(next.x + next.width - this.winW - 4);
        this.floorY = floorYFor(next, this.winH);
      } else {
        this.x = minX;
        this.xFrac = 0;
        this.animator.setFacing(1);
      }
    } else if (this.x >= maxX) {
      const next = neighborInDir(this.screens, here, 1);
      if (next) {
        this.x = Math.round(next.x + 4);
        this.floorY = floorYFor(next, this.winH);
      } else {
        this.x = maxX;
        this.xFrac = 0;
        this.animator.setFacing(-1);
      }
    }
  }

  private currentScreen(): ScreenRect | null {
    if (!this.screens.length) return null;
    const cx = this.x + this.winW / 2;
    const cy = this.y + this.winH - 8;
    return (
      screenAt(this.screens, cx, cy) ??
      screenAtX(this.screens, cx, cy) ??
      this.screens[0]!
    );
  }

  private pickNext(nowMs: number) {
    const mood = this.mood.kind(nowMs);
    const roll = Math.random();

    if (mood === "mad" || mood === "neglected") {
      if (this.state === "sit") {
        this.enter(roll < 0.35 ? "walk" : "idle", nowMs);
      } else {
        this.enter(roll < 0.65 ? "sit" : "idle", nowMs);
      }
      return;
    }

    // Occasional curiosity stroll toward the remembered cursor.
    if (this.tryStartCuriousFollow(nowMs)) return;

    if (this.state === "walk") {
      this.enter(roll < 0.55 ? "sit" : "idle", nowMs);
      return;
    }
    if (this.state === "sit" || this.state === "purr") {
      this.enter(roll < 0.65 ? "idle" : "walk", nowMs);
      return;
    }
    if (roll < 0.5) this.enter("walk", nowMs);
    else if (roll < 0.75) this.enter("sit", nowMs);
    else this.enter("idle", nowMs);
  }

  private enter(next: BehaviorState, nowMs: number) {
    this.state = next;
    this.animator.setClip(clipFor(next), true);
    this.xFrac = 0;

    if (next === "walk") {
      if (this.followX === null && Math.random() < 0.25) {
        this.animator.setFacing(this.animator.getFacing() === 1 ? -1 : 1);
      }
      this.stateUntil = nowMs + 3000 + Math.random() * 4000;
    } else if (next === "purr") {
      this.stateUntil = nowMs + 1800 + Math.random() * 600;
    } else if (next === "sit") {
      this.stateUntil = nowMs + 3500 + Math.random() * 4500;
    } else {
      this.stateUntil = nowMs + 2500 + Math.random() * 3500;
    }
  }

  /** Start walk anim only when entering it — never reset every frame (that freezes legs). */
  private ensureWalkAnim() {
    this.state = "walk";
    if (this.animator.getClip() !== "walk") {
      this.animator.setClip("walk", true);
    }
  }

  private schedule(nowMs: number) {
    this.enter("idle", nowMs);
  }
}

function clipFor(state: BehaviorState): ClipName {
  if (state === "purr") return "sit";
  return state;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
