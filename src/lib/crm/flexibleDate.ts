export type ExcelDateSystem = '1900' | '1904';

export type ParsedCrmDate =
  | { kind: 'single'; startIso: string; endIso: null; hasTime: boolean }
  | { kind: 'range'; startIso: string; endIso: string; hasTime: boolean; startHasTime: boolean; endHasTime: boolean }
  | { kind: 'invalid'; startIso: null; endIso: null; hasTime: false };

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  hasTime: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NUMBER = new Map([
  ['jan', 1], ['january', 1], ['feb', 2], ['february', 2], ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4], ['may', 5], ['jun', 6], ['june', 6], ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8], ['sep', 9], ['sept', 9], ['september', 9], ['oct', 10],
  ['october', 10], ['nov', 11], ['november', 11], ['dec', 12], ['december', 12],
]);

function fourDigitYear(value: number): number {
  if (value >= 100) return value;
  return value <= 69 ? 2000 + value : 1900 + value;
}

function timeParts(hourValue?: string, minuteValue?: string, secondValue?: string, meridiemValue?: string) {
  if (hourValue === undefined) return { hour: 0, minute: 0, second: 0, hasTime: false };
  let hour = Number(hourValue);
  const minute = Number(minuteValue ?? 0);
  const second = Number(secondValue ?? 0);
  const meridiem = meridiemValue?.toLowerCase();
  if (minute > 59 || second > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  } else if (hour > 23) return null;
  return { hour, minute, second, hasTime: true };
}

function validDate(parts: DateParts): Date | null {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day
    && date.getUTCHours() === parts.hour
    && date.getUTCMinutes() === parts.minute
    && date.getUTCSeconds() === parts.second
    ? date : null;
}

function fromParts(year: string, month: string | number, day: string, hour?: string, minute?: string, second?: string, meridiem?: string) {
  const parsedTime = timeParts(hour, minute, second, meridiem);
  const monthNumber = typeof month === 'number' ? month : Number(month);
  if (!parsedTime || !monthNumber) return null;
  const parts: DateParts = {
    year: fourDigitYear(Number(year)), month: monthNumber, day: Number(day), ...parsedTime,
  };
  const date = validDate(parts);
  return date ? { date, hasTime: parts.hasTime } : null;
}

function parseSingle(value: string, dateSystem: ExcelDateSystem) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (/^\d{1,7}(?:\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial <= 0 || serial >= 2_958_466) return null;
    const base = dateSystem === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const milliseconds = Math.round((base + serial * 86_400_000) / 1000) * 1000;
    return { date: new Date(milliseconds), hasTime: !Number.isInteger(serial) };
  }

  let match = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (match) return fromParts(match[1], match[2], match[3], match[4], match[5], match[6], match[7]);

  match = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (match) return fromParts(match[3], match[2], match[1], match[4], match[5], match[6], match[7]);

  match = trimmed.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{2}|\d{4})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (match) return fromParts(match[3], MONTH_NUMBER.get(match[2].toLowerCase()) ?? 0, match[1], match[4], match[5], match[6], match[7]);

  match = trimmed.match(/^([a-z]+)\s+(\d{1,2})(?:,)?\s+(\d{2}|\d{4})(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?)?$/i);
  if (match) return fromParts(match[3], MONTH_NUMBER.get(match[1].toLowerCase()) ?? 0, match[2], match[4], match[5], match[6], match[7]);

  return null;
}

function rangeParts(value: string): [string, string] | null {
  const explicit = value.match(/^(.*?)\s+(?:to|through|until|-|\u2013|\u2014)\s+(.*?)$/i);
  if (explicit) return [explicit[1], explicit[2]];
  const pairedIso = value.match(/^(\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?)?)\s+(\d{4}-\d{1,2}-\d{1,2}(?:[T ]\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?)?)$/i);
  return pairedIso ? [pairedIso[1], pairedIso[2]] : null;
}

export function parseCrmDate(value: unknown, dateSystem: ExcelDateSystem = '1900'): ParsedCrmDate {
  const source = String(value ?? '').trim();
  if (!source) return { kind: 'invalid', startIso: null, endIso: null, hasTime: false };
  const range = rangeParts(source);
  if (range) {
    const start = parseSingle(range[0], dateSystem);
    const end = parseSingle(range[1], dateSystem);
    if (!start || !end || end.date.getTime() < start.date.getTime()) {
      return { kind: 'invalid', startIso: null, endIso: null, hasTime: false };
    }
    if (start.date.getTime() === end.date.getTime()) {
      return { kind: 'single', startIso: start.date.toISOString(), endIso: null, hasTime: start.hasTime || end.hasTime };
    }
    return {
      kind: 'range', startIso: start.date.toISOString(), endIso: end.date.toISOString(),
      hasTime: start.hasTime || end.hasTime, startHasTime: start.hasTime, endHasTime: end.hasTime,
    };
  }
  const parsed = parseSingle(source, dateSystem);
  return parsed
    ? { kind: 'single', startIso: parsed.date.toISOString(), endIso: null, hasTime: parsed.hasTime }
    : { kind: 'invalid', startIso: null, endIso: null, hasTime: false };
}

function displayIso(iso: string, hasTime: boolean): string {
  const date = new Date(iso);
  const base = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  if (!hasTime) return base;
  const hour = date.getUTCHours();
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${base}, ${hour % 12 || 12}:${minute} ${hour >= 12 ? 'pm' : 'am'}`;
}

export function formatCrmDateForDisplay(value: unknown, dateSystem: ExcelDateSystem = '1900'): string {
  const source = String(value ?? '').trim();
  const parsed = parseCrmDate(source, dateSystem);
  if (parsed.kind === 'invalid') return source;
  if (parsed.kind === 'range') {
    return `${displayIso(parsed.startIso, parsed.startHasTime)} – ${displayIso(parsed.endIso, parsed.endHasTime)}`;
  }
  return displayIso(parsed.startIso, parsed.hasTime);
}
