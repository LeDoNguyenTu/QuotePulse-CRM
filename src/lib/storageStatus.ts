export type CapacityTone = 'safe' | 'warning' | 'critical';

export interface CapacityStatus {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  percent: number;
  progressPercent: number;
  tone: CapacityTone;
}

export function capacityStatus(usedBytes: number, limitBytes: number): CapacityStatus {
  const used = Math.max(0, Number.isFinite(usedBytes) ? usedBytes : 0);
  const limit = Math.max(1, Number.isFinite(limitBytes) ? limitBytes : 1);
  const percent = Math.round((used / limit) * 1_000) / 10;
  return {
    usedBytes: used,
    limitBytes: limit,
    remainingBytes: Math.max(0, limit - used),
    percent,
    progressPercent: Math.min(100, percent),
    tone: percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'safe',
  };
}

export function formatBytes(bytes: number): string {
  const value = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (value < 1_000) return `${Math.round(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value;
  let unit = -1;
  do {
    scaled /= 1_000;
    unit += 1;
  } while (scaled >= 1_000 && unit < units.length - 1);
  const digits = scaled >= 100 || Number.isInteger(scaled) ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${units[unit]}`;
}
