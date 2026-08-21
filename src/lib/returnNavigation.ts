export interface RouteLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

export interface ReturnNavigationState {
  from: string;
  scrollY: number;
}

const SCROLL_PREFIX = 'quotepulse:scroll:';

export function routePath(location: RouteLocation): string {
  return `${location.pathname}${location.search ?? ''}${location.hash ?? ''}`;
}

export function detailNavigationState(location: RouteLocation, scrollY: number): ReturnNavigationState {
  return { from: routePath(location), scrollY: Math.max(0, Math.round(scrollY)) };
}

function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export function safeReturnTarget(state: unknown, fallback: string): string {
  if (!state || typeof state !== 'object') return fallback;
  const from = (state as Partial<ReturnNavigationState>).from;
  return isInternalPath(from) ? from : fallback;
}

export function saveScrollPosition(storage: Storage, route: string, scrollY: number): void {
  if (!isInternalPath(route) || !Number.isFinite(scrollY) || scrollY < 0) return;
  storage.setItem(`${SCROLL_PREFIX}${route}`, String(Math.round(scrollY)));
}

export function consumeScrollPosition(storage: Storage, route: string): number | null {
  const key = `${SCROLL_PREFIX}${route}`;
  const raw = storage.getItem(key);
  storage.removeItem(key);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
