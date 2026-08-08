export type JobProvider = 'greenhouse' | 'lever';

export interface DiscoveredJob {
  externalId: string;
  title: string;
  location: string | null;
  department: string | null;
  workplaceType: string | null;
  applyUrl: string;
  sourceUrl: string | null;
  postedAt: string | null;
}

export function supportedProvider(value: string): value is JobProvider {
  return value === 'greenhouse' || value === 'lever';
}

export function normalizeGreenhouseJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  const jobs = object(payload).jobs;
  if (!Array.isArray(jobs)) return [];

  return jobs.flatMap((value) => {
    const job = object(value);
    const externalId = text(job.id);
    const title = text(job.title);
    const applyUrl = safeHttpsUrl(text(job.absolute_url));
    if (!externalId || !title || !applyUrl) return [];
    const location = text(object(job.location).name) ?? null;
    const department = firstName(job.departments);
    const postedAt = isoDate(text(job.updated_at));
    return [{
      externalId,
      title,
      location,
      department,
      workplaceType: null,
      applyUrl,
      sourceUrl: applyUrl,
      postedAt,
    }];
  });
}

export function normalizeLeverJobs(_identifier: string, payload: unknown): DiscoveredJob[] {
  if (!Array.isArray(payload)) return [];

  return payload.flatMap((value) => {
    const job = object(value);
    const externalId = text(job.id);
    const title = text(job.text);
    const applyUrl = safeHttpsUrl(text(job.applyUrl)) ?? safeHttpsUrl(text(job.hostedUrl));
    if (!externalId || !title || !applyUrl) return [];
    const categories = object(job.categories);
    const hostedUrl = safeHttpsUrl(text(job.hostedUrl));
    return [{
      externalId,
      title,
      location: text(categories.location) ?? null,
      department: text(categories.team) ?? null,
      workplaceType: text(categories.commitment) ?? null,
      applyUrl,
      sourceUrl: hostedUrl ?? applyUrl,
      postedAt: epochDate(job.createdAt),
    }];
  });
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 2_000) : null;
}

function firstName(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return text(object(value[0]).name);
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function isoDate(value: string | null): string | null {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function epochDate(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
