// Global tuning values. Weapon balance rules live in weapons.ts and derive from these.

export const WIDTH = 1280;

export const HEIGHT = 720;

export const HUD_HEIGHT = 92;

/**
 * The battlefield is this much larger than the screen area it's shown in (maps are
 * designed in screen coordinates and scaled up; the whole battlefield is drawn at
 * 1 / MAP_SCALE). Fighters, weapon reach and speeds are unchanged, so there's more room.
 */
export const MAP_SCALE = 1.4;

/** One colour per player slot; the number of slots is the player cap. */
export const PLAYER_COLORS = [0xff5a5a, 0x4fa3ff, 0x5ad46a, 0xffc93c, 0xb57bff, 0x3fd8d0, 0xff8f3a, 0xe6e6e6];

/** Team mode: index 0 = red team, 1 = blue team. */
export const TEAM_COLORS = [0xe8473c, 0x3b82f6];

/** Loading screen shown between fighter setup and the battle countdown. */
export const BATTLE_LOADING_MS = 5000;

/** After the bar fills, the loading screen stays up this long before the battle. */
export const BATTLE_LOADING_HOLD_MS = 2000;

/** Time to view the frozen battlefield before the numbered countdown begins. */
export const BATTLE_READY_SECONDS = 3;

/** Seconds of 5-4-3-2-1 before a round starts; nobody can move until it ends. */
export const COUNTDOWN = 5;

/**
 * Render scale. Game logic always uses WIDTH x HEIGHT units, but the canvas is
 * rendered at roughly the number of physical pixels it will cover on screen
 * (window size x devicePixelRatio), so it stays sharp on large / Retina displays.
 */
export const RES = Math.min(
  3,
  Math.max(1, Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT) * (window.devicePixelRatio || 1)),
);
