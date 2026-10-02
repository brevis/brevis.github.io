export const LANE_W = 2.2;
export const CHUNK_LEN = 30;
export const BRIDGE_W = 7.6;
export const GAP_LEN = 14;
export const HOOK_Y = 10;
export const HOOK_AHEAD = 5; // ring is drawn this far ahead of the swing anchor
export const GRAVITY = -30;
export const JUMP_V = 10.2;
export const BASE_SPEED = 13;
export const MAX_SPEED = 24;
export const LEVEL_DIST = 250;
export const RUSH_COMBO = 5;
export const RUSH_TIME = 7;
export const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
