import {
  availableMonitors,
  primaryMonitor,
  type Monitor,
} from "@tauri-apps/api/window";

/** Monitor rect in logical pixels (matches LogicalPosition / setSize). */
export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function monitorToLogical(m: Monitor): ScreenRect {
  const s = m.scaleFactor || 1;
  return {
    x: m.position.x / s,
    y: m.position.y / s,
    width: m.size.width / s,
    height: m.size.height / s,
    scale: s,
  };
}

export async function loadScreens(): Promise<ScreenRect[]> {
  const list = await availableMonitors();
  return list.map(monitorToLogical);
}

export async function primaryScreen(): Promise<ScreenRect | null> {
  const m = await primaryMonitor();
  return m ? monitorToLogical(m) : null;
}

export function floorYFor(
  screen: ScreenRect,
  winH: number,
  margin = 48,
): number {
  return Math.round(screen.y + screen.height - winH - margin);
}

export function screenAt(
  screens: ScreenRect[],
  x: number,
  y: number,
): ScreenRect | null {
  for (const s of screens) {
    if (
      x >= s.x &&
      x < s.x + s.width &&
      y >= s.y &&
      y < s.y + s.height
    ) {
      return s;
    }
  }
  return null;
}

export function neighborInDir(
  screens: ScreenRect[],
  from: ScreenRect,
  dir: 1 | -1,
  gapSlack = 120,
): ScreenRect | null {
  const fromRight = from.x + from.width;
  const fromLeft = from.x;
  const fromTop = from.y;
  const fromBot = from.y + from.height;

  let best: ScreenRect | null = null;
  let bestDist = Infinity;

  for (const s of screens) {
    if (sameScreen(s, from)) continue;
    const overlapY =
      Math.min(fromBot, s.y + s.height) - Math.max(fromTop, s.y);
    if (overlapY < 40) continue;

    if (dir === 1) {
      const dist = s.x - fromRight;
      if (dist >= -gapSlack && dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    } else {
      const dist = fromLeft - (s.x + s.width);
      if (dist >= -gapSlack && dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
  }
  return best;
}

export function screenAtX(
  screens: ScreenRect[],
  x: number,
  preferY?: number,
): ScreenRect | null {
  const hits = screens.filter((s) => x >= s.x && x < s.x + s.width);
  if (!hits.length) return null;
  if (preferY === undefined) return hits[0]!;
  hits.sort(
    (a, b) =>
      Math.abs(a.y + a.height / 2 - preferY) -
      Math.abs(b.y + b.height / 2 - preferY),
  );
  return hits[0]!;
}

export function sameScreen(a: ScreenRect, b: ScreenRect): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** Convert a physical cursor point into logical coords using the monitor it sits on. */
export function physicalCursorToLogical(
  screensPhysical: Monitor[],
  px: number,
  py: number,
): { x: number; y: number } | null {
  for (const m of screensPhysical) {
    const s = m.scaleFactor || 1;
    if (
      px >= m.position.x &&
      px < m.position.x + m.size.width &&
      py >= m.position.y &&
      py < m.position.y + m.size.height
    ) {
      return {
        x: m.position.x / s + (px - m.position.x) / s,
        y: m.position.y / s + (py - m.position.y) / s,
      };
    }
  }
  const m = screensPhysical[0];
  if (!m) return null;
  const s = m.scaleFactor || 1;
  return { x: px / s, y: py / s };
}
