// The 2.5D battle view: a camera that looks down at the battle map at an angle, with perspective.
// Pure math, so it can be tested without a canvas. World coordinates are pixels of the flat map
// (TILE pixels per square, y growing towards the viewer); h is a height above the ground in the same units.

/** How far the camera leans back from looking straight down. */
export const TILT_ANGLE = (50 * Math.PI) / 180;
const SIN = Math.sin(TILT_ANGLE);
const COS = Math.cos(TILT_ANGLE);

export interface TiltCam {
  /** The world point the camera looks at. */
  fx: number;
  fy: number;
  /** Screen pixels per world pixel at the focus. */
  k: number;
  /** Where the focus lands on screen. */
  cx: number;
  cy: number;
  /** Camera distance from the focus, in world pixels: smaller means stronger perspective. */
  dist: number;
}

export interface Projected { x: number; y: number; /** Size factor at this point, 1 at the focus. */ s: number }

/** Where a world point appears on screen. */
export function project(cam: TiltCam, wx: number, wy: number, h = 0): Projected {
  const X = wx - cam.fx, Z = wy - cam.fy;
  const depth = Math.max(cam.dist * 0.12, cam.dist - Z * SIN - h * COS);
  const s = cam.dist / depth;
  return { x: cam.cx + cam.k * X * s, y: cam.cy + cam.k * (Z * COS - h * SIN) * s, s };
}

/** The ground point under a screen point (the inverse of project at height 0); null above the horizon. */
export function unproject(cam: TiltCam, sx: number, sy: number): { x: number; y: number } | null {
  const u = (sx - cam.cx) / cam.k, v = (sy - cam.cy) / cam.k;
  const den = cam.dist * COS + v * SIN;
  if (den <= 1e-6) return null;
  const Z = (v * cam.dist) / den;
  const X = (u * (cam.dist - Z * SIN)) / cam.dist;
  return { x: cam.fx + X, y: cam.fy + Z };
}

/** How much a circle on the ground is squashed on screen (height over width). */
export const GROUND_SQUASH = COS;

/**
 * Keep the camera over the map: centred when the map fits, otherwise never showing much beyond its edges.
 * `viewW`/`viewH` are the screen size, `mapW`/`mapH` the map in world pixels.
 */
export function clampFocus(fx: number, fy: number, k: number, viewW: number, viewH: number, mapW: number, mapH: number, margin: number): { fx: number; fy: number } {
  const halfW = viewW / k / 2, halfH = viewH / (k * COS) / 2;
  const cx = mapW + margin * 2 <= halfW * 2 ? mapW / 2 : Math.min(mapW + margin - halfW, Math.max(halfW - margin, fx));
  const cy = mapH + margin * 2 <= halfH * 2 ? mapH / 2 : Math.min(mapH + margin - halfH * 0.85, Math.max(halfH * 0.85 - margin, fy));
  return { fx: cx, fy: cy };
}

/** Zoom steps the player can choose, as a multiple of "the whole fight fits". */
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.6;
export const ZOOM_DEFAULT = 1.6;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 20) / 20));
