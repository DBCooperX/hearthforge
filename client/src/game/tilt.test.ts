import { describe, expect, it } from 'vitest';
import { clampFocus, clampZoom, project, unproject, ZOOM_MAX, ZOOM_MIN, type TiltCam } from './tilt';

const cam: TiltCam = { fx: 160, fy: 100, k: 3.5, cx: 400, cy: 300, dist: 288 };

describe('2.5D camera', () => {
  it('puts the focus at the focus point, at size 1', () => {
    const p = project(cam, cam.fx, cam.fy);
    expect(p.x).toBeCloseTo(cam.cx);
    expect(p.y).toBeCloseTo(cam.cy);
    expect(p.s).toBeCloseTo(1);
  });

  it('draws near rows bigger than far rows', () => {
    expect(project(cam, 160, 180).s).toBeGreaterThan(1);
    expect(project(cam, 160, 20).s).toBeLessThan(1);
  });

  it('finds the ground point under the pointer again (clicks land on the right square)', () => {
    for (const [x, y] of [[0, 0], [352, 208], [37, 190], [300, 12], [160, 100]]) {
      const s = project(cam, x, y);
      const g = unproject(cam, s.x, s.y)!;
      expect(g.x).toBeCloseTo(x, 6);
      expect(g.y).toBeCloseTo(y, 6);
    }
  });

  it('raises things with height on screen', () => {
    expect(project(cam, 160, 100, 20).y).toBeLessThan(project(cam, 160, 100, 0).y);
  });

  it('centres a map that fits and keeps a big one in view', () => {
    expect(clampFocus(0, 0, 1, 2000, 2000, 300, 200, 10)).toEqual({ fx: 150, fy: 100 });
    const c = clampFocus(-500, 9999, 4, 800, 600, 640, 640, 10);
    expect(c.fx).toBeGreaterThan(0);
    expect(c.fy).toBeLessThan(640);
  });

  it('keeps zoom within its range', () => {
    expect(clampZoom(0.2)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });
});
