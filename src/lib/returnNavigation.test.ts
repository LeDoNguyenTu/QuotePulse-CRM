import { describe, expect, it } from 'vitest';
import {
  consumeScrollPosition,
  detailNavigationState,
  safeReturnTarget,
  saveScrollPosition,
} from './returnNavigation';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('return navigation', () => {
  it('records the full internal route and scroll position for drill-down', () => {
    expect(detailNavigationState({ pathname: '/', search: '?view=deals&dq=acme', hash: '#row' }, 640)).toEqual({
      from: '/?view=deals&dq=acme#row',
      scrollY: 640,
    });
  });

  it('accepts only same-app absolute-path return targets', () => {
    expect(safeReturnTarget({ from: '/?cq=acme', scrollY: 12 }, '/')).toBe('/?cq=acme');
    expect(safeReturnTarget({ from: 'https://attacker.example', scrollY: 12 }, '/')).toBe('/');
    expect(safeReturnTarget({ from: '//attacker.example', scrollY: 12 }, '/')).toBe('/');
    expect(safeReturnTarget({ from: '/\\attacker.example', scrollY: 12 }, '/')).toBe('/');
    expect(safeReturnTarget(null, '/uploaded-files')).toBe('/uploaded-files');
  });

  it('restores a saved scroll position once', () => {
    const storage = new MemoryStorage();
    saveScrollPosition(storage, '/?cq=acme', 481.7);
    expect(consumeScrollPosition(storage, '/?cq=acme')).toBe(482);
    expect(consumeScrollPosition(storage, '/?cq=acme')).toBeNull();
  });

  it('ignores malformed or negative scroll positions', () => {
    const storage = new MemoryStorage();
    storage.setItem('quotepulse:scroll:/', '-4');
    expect(consumeScrollPosition(storage, '/')).toBeNull();
    storage.setItem('quotepulse:scroll:/', 'oops');
    expect(consumeScrollPosition(storage, '/')).toBeNull();
  });
});
