import {
  LogicalPosition,
  LogicalSize,
  availableMonitors,
  cursorPosition,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { loadAtlas, SpriteAnimator } from "./cat/sprites";
import { CatBehavior, hotspotAt, isBackHit, isHeadHit } from "./cat/behavior";
import { stubReply } from "./cat/mood";
import {
  loadScreens,
  physicalCursorToLogical,
  primaryScreen,
  screenAt,
} from "./cat/monitors";
import { playPurr, toggleMute, isMuted } from "./cat/sound";

const CAT = 128;
const PAD_TOP = 40;
const IDLE_W = CAT;
const IDLE_H = CAT + PAD_TOP;
const CHAT_W = 280;
const CHAT_H = 300;
const DRAG_THRESHOLD = 6;

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#cat");
  const chatEl = document.querySelector<HTMLElement>("#chat");
  const chatLog = document.querySelector<HTMLElement>("#chat-log");
  const chatForm = document.querySelector<HTMLFormElement>("#chat-form");
  const chatInput = document.querySelector<HTMLInputElement>("#chat-input");
  const petFx = document.querySelector<HTMLElement>("#pet-fx");
  if (!canvas || !chatEl || !chatLog || !chatForm || !chatInput || !petFx) {
    throw new Error("UI elements missing");
  }
  const cat = canvas;
  const chat = chatEl;
  const log = chatLog;
  const input = chatInput;
  const fx = petFx;

  const ctx = cat.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;

  const { img, meta } = await loadAtlas();
  cat.width = meta.frameWidth;
  cat.height = meta.frameHeight;

  const animator = new SpriteAnimator(img, meta);
  const behavior = new CatBehavior(animator, performance.now());
  behavior.setWindowSize(IDLE_W, IDLE_H);

  const win = getCurrentWindow();
  let chatOpen = false;
  let lastClick = 0;
  let clickGen = 0;
  let lastSentX = 0;
  let lastSentY = 0;

  async function placeOnPrimary() {
    const screens = await loadScreens();
    const home = (await primaryScreen()) ?? screens[0];
    if (!home) return screens;
    behavior.setWindowSize(IDLE_W, IDLE_H);
    behavior.setScreens(screens.length ? screens : [home]);
    behavior.goHome(home);
    await win.setSize(new LogicalSize(IDLE_W, IDLE_H));
    await win.setPosition(new LogicalPosition(behavior.x, behavior.y));
    lastSentX = behavior.x;
    lastSentY = behavior.y;
    console.info("myagent: home", {
      x: behavior.x,
      y: behavior.y,
      screens: screens.length,
    });
    return screens;
  }

  await win.setSize(new LogicalSize(IDLE_W, IDLE_H));
  await placeOnPrimary();

  function appendLine(who: "you" | "cat", text: string) {
    const p = document.createElement("p");
    p.className = `line ${who}`;
    p.textContent = who === "you" ? `you: ${text}` : `cat: ${text}`;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  async function openChat() {
    if (chatOpen) return;
    chatOpen = true;
    const now = performance.now();
    const feet = behavior.footY();
    behavior.setChatting(true, now);

    behavior.setWindowSize(CHAT_W, CHAT_H);
    behavior.setWindowBottom(feet);
    await win.setSize(new LogicalSize(CHAT_W, CHAT_H));
    await win.setPosition(new LogicalPosition(behavior.x, behavior.y));
    lastSentX = behavior.x;
    lastSentY = behavior.y;

    chat.classList.remove("hidden");
    chat.setAttribute("aria-hidden", "false");
    await win.setFocus();
    input.focus();

    if (!log.childElementCount) {
      const mood = behavior.moodKind(now);
      appendLine(
        "cat",
        mood === "mad" || mood === "neglected"
          ? "……what."
          : "mrrp. you may speak.",
      );
    }
  }

  async function closeChat() {
    if (!chatOpen) return;
    chatOpen = false;
    const now = performance.now();
    const feet = behavior.footY();
    behavior.setChatting(false, now);

    chat.classList.add("hidden");
    chat.setAttribute("aria-hidden", "true");
    input.blur();

    behavior.setWindowSize(IDLE_W, IDLE_H);
    behavior.setWindowBottom(feet);
    await win.setSize(new LogicalSize(IDLE_W, IDLE_H));
    await win.setPosition(new LogicalPosition(behavior.x, behavior.y));
    lastSentX = behavior.x;
    lastSentY = behavior.y;
  }

  function flashPet() {
    fx.textContent = "♥";
    fx.classList.remove("show");
    void fx.offsetWidth;
    fx.classList.add("show");
    window.setTimeout(() => fx.classList.remove("show"), 450);
    void playPurr();
  }

  function canvasLocal(e: { clientX: number; clientY: number }) {
    const rect = cat.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * CAT;
    const ly = ((e.clientY - rect.top) / Math.max(1, rect.height)) * CAT;
    return { lx, ly };
  }

  function updateHoverCursor(e: { clientX: number; clientY: number }) {
    if (chatOpen || behavior.carrying || pendingGrab) {
      cat.style.cursor = behavior.carrying || pendingGrab ? "grabbing" : "pointer";
      if (behavior.carrying || pendingGrab) {
        cat.title = "Drop";
        cat.setAttribute("aria-label", "Carrying cat — release to drop");
      }
      return;
    }
    const { lx, ly } = canvasLocal(e);
    const spot = hotspotAt(lx, ly, animator.getFacing());
    if (spot === "back") {
      cat.style.cursor = "grab";
      cat.title = "Drag";
      cat.setAttribute("aria-label", "Cat back — drag to move");
    } else if (spot === "head") {
      cat.style.cursor = "pointer";
      cat.title = "Pet";
      cat.setAttribute("aria-label", "Cat head — click to pet, double-click to chat");
    } else {
      cat.style.cursor = "default";
      cat.title = "";
      cat.setAttribute("aria-label", "Desktop cat");
    }
  }

  cat.addEventListener("pointerleave", () => {
    if (behavior.carrying || pendingGrab || dragging) return;
    cat.title = "";
    cat.style.cursor = "default";
    cat.setAttribute("aria-label", "Desktop cat");
  });

  let pendingGrab = false;
  let dragging = false;
  let grabOffX = 0;
  let grabOffY = 0;
  let grabStartClientX = 0;
  let grabStartClientY = 0;
  let dragMovePending = false;

  async function syncCarryToCursor() {
    if (!dragging || dragMovePending) return;
    dragMovePending = true;
    try {
      const [c, mons] = await Promise.all([
        cursorPosition(),
        availableMonitors(),
      ]);
      const logical = physicalCursorToLogical(mons, c.x, c.y);
      if (!logical || !dragging) return;
      behavior.setCarryPosition(logical.x - grabOffX, logical.y - grabOffY);
      queuedX = behavior.x;
      queuedY = behavior.y;
      flushMove();
    } catch {
      /* ignore */
    } finally {
      dragMovePending = false;
    }
  }

  cat.addEventListener("pointermove", (e) => {
    if (!pendingGrab && !dragging) {
      updateHoverCursor(e);
      return;
    }

    const dx = e.clientX - grabStartClientX;
    const dy = e.clientY - grabStartClientY;
    if (pendingGrab && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      pendingGrab = false;
      dragging = true;
      clickGen += 1; // cancel pending pet click
      cat.classList.add("carrying");
      cat.style.cursor = "grabbing";
      behavior.beginCarry(performance.now());
    }

    if (dragging) void syncCarryToCursor();
  });

  cat.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || chatOpen || behavior.carrying) return;
    const { lx, ly } = canvasLocal(e);
    if (!isBackHit(lx, ly, animator.getFacing())) {
      updateHoverCursor(e);
      return;
    }

    pendingGrab = true;
    dragging = false;
    grabStartClientX = e.clientX;
    grabStartClientY = e.clientY;
    // client coords == offset within the transparent window
    grabOffX = e.clientX;
    grabOffY = e.clientY;
    cat.setPointerCapture(e.pointerId);
    cat.style.cursor = "grabbing";
  });

  function finishPointer(e: PointerEvent) {
    if (!pendingGrab && !dragging) return;
    const wasDragging = dragging;
    pendingGrab = false;
    if (dragging) {
      dragging = false;
      cat.classList.remove("carrying");
      behavior.endCarry(performance.now());
      queuedX = behavior.x;
      queuedY = behavior.y;
      flushMove();
      clickGen += 1;
    }
    try {
      cat.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    updateHoverCursor(e);
    if (wasDragging) e.preventDefault();
  }

  cat.addEventListener("pointerup", finishPointer);
  cat.addEventListener("pointercancel", finishPointer);

  cat.addEventListener("click", (e) => {
    e.preventDefault();
    if (behavior.carrying || dragging || pendingGrab) return;
    const { lx, ly } = canvasLocal(e);
    const facing = animator.getFacing();
    // Head only for pet / chat; back is drag; elsewhere ignores.
    if (!isHeadHit(lx, ly, facing)) return;

    const now = performance.now();
    const isDouble = now - lastClick < 350;
    lastClick = now;
    const gen = ++clickGen;

    if (isDouble) {
      void openChat();
      return;
    }

    window.setTimeout(() => {
      if (gen !== clickGen) return;
      if (chatOpen || behavior.carrying) return;
      if (behavior.pet(performance.now())) flashPet();
    }, 280);
  });

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    appendLine("you", text);
    const mood = behavior.moodKind(performance.now());
    appendLine("cat", stubReply(text, mood));
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") void closeChat();
    if (e.key === "m" || e.key === "M") {
      if (chatOpen && document.activeElement === input) return;
      const on = toggleMute();
      console.info(on ? "myagent: muted" : "myagent: sound on");
    }
    // Rescue: bring cat back to primary display
    if (e.key === "h" || e.key === "H") {
      if (chatOpen && document.activeElement === input) return;
      void placeOnPrimary();
    }
  });

  let last = performance.now();
  let screensAcc = 0;
  let followAcc = 0;
  let movePending = false;
  let queuedX: number | null = null;
  let queuedY: number | null = null;
  let moveAcc = 0;
  const MOVE_INTERVAL_MS = 32;
  const FOLLOW_POLL_MS = 400;

  const flushMove = () => {
    if (movePending || queuedX === null || queuedY === null) return;
    const x = queuedX;
    const y = queuedY;
    queuedX = null;
    queuedY = null;
    if (x === lastSentX && y === lastSentY) return;
    movePending = true;
    lastSentX = x;
    lastSentY = y;
    void win
      .setPosition(new LogicalPosition(x, y))
      .catch(() => {})
      .finally(() => {
        movePending = false;
        if (queuedX !== null) flushMove();
      });
  };

  const tick = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;

    screensAcc += dt;
    if (screensAcc > 4000) {
      screensAcc = 0;
      void loadScreens().then((s) => {
        if (!s.length || chatOpen) return;
        behavior.setScreens(s);
        // If we drifted off every screen, rescue.
        if (!screenAt(s, behavior.x + 64, behavior.y + 80)) {
          void placeOnPrimary();
        }
      });
    }

    followAcc += dt;
    if (followAcc >= FOLLOW_POLL_MS) {
      followAcc = 0;
      if (!chatOpen && !behavior.carrying && !dragging) {
        void Promise.all([cursorPosition(), availableMonitors()])
          .then(([c, mons]) => {
            const logical = physicalCursorToLogical(mons, c.x, c.y);
            if (!logical) return;
            behavior.noticeUserAt(logical.x, logical.y, performance.now());
          })
          .catch(() => {});
      }
    }

    behavior.update(now, dt);
    animator.draw(ctx);

    if (!chatOpen) {
      moveAcc += dt;
      if (behavior.x !== lastSentX || behavior.y !== lastSentY) {
        queuedX = behavior.x;
        queuedY = behavior.y;
      }
      if (moveAcc >= MOVE_INTERVAL_MS) {
        moveAcc = 0;
        flushMove();
      }
    }

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
  if (isMuted()) console.info("myagent: muted (press M to unmute)");
  console.info("myagent: press H to summon cat to primary display");
}

window.addEventListener("DOMContentLoaded", () => {
  main().catch((err) => console.error(err));
});
