import { describe, expect, it } from 'vitest';
import { ARROW_MIN_HANDLE, dependencyArrowPath } from './DependencyArrows';

function parsePath(d: string) {
  // "M x1 y1 C cx1 cy1, cx2 cy2, x2 y2"
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = nums;
  return { x1, y1, cx1, cy1, cx2, cy2, x2, y2 };
}

describe('dependencyArrowPath', () => {
  it('starts at the blocker end and finishes at the blocked start', () => {
    const p = parsePath(dependencyArrowPath(100, 50, 300, 122));
    expect([p.x1, p.y1]).toEqual([100, 50]);
    expect([p.x2, p.y2]).toEqual([300, 122]);
  });

  it('control points keep the curve horizontal at both ends', () => {
    const p = parsePath(dependencyArrowPath(100, 50, 300, 122));
    expect(p.cy1).toBe(50); // tangent leaves the blocker horizontally
    expect(p.cy2).toBe(122); // and enters the blocked bar horizontally
  });

  it('handle length is half the horizontal distance for long hops', () => {
    const p = parsePath(dependencyArrowPath(0, 0, 200, 72));
    expect(p.cx1).toBe(100); // 0 + 200/2
    expect(p.cx2).toBe(100); // 200 - 200/2
  });

  it('handle length never collapses below the minimum for short hops', () => {
    const p = parsePath(dependencyArrowPath(0, 0, 10, 36));
    expect(p.cx1).toBe(ARROW_MIN_HANDLE);
    expect(p.cx2).toBe(10 - ARROW_MIN_HANDLE);
  });

  it('backward edges (blocked starts before blocker ends) still bow outward', () => {
    const p = parsePath(dependencyArrowPath(300, 50, 100, 122));
    expect(p.cx1).toBeGreaterThan(300); // exits rightward from the blocker
    expect(p.cx2).toBeLessThan(100); // enters leftward into the blocked bar
  });
});
