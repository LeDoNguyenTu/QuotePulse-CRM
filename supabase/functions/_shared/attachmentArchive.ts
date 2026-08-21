export type AttachmentRecord = {
  id: string;
  created_at: string;
  [key: string]: unknown;
};

export function assertCompanyArchivePointer(key: string, ownerId: string, companyId: string): void {
  const companyPrefix = `owners/${ownerId}/companies/${companyId}/generic-attachments/`;
  const batchPrefix = `owners/${ownerId}/attachment-batches/`;
  if (!key.startsWith(companyPrefix) && !key.startsWith(batchPrefix)) {
    throw new Error('Attachment archive pointer is outside the requested owner scope.');
  }
}

export function attachmentsForCompany<T extends AttachmentRecord>(payload: unknown, companyId: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];
  const companies = (payload as { companies?: Array<{ company_id: string; attachments: T[] }> }).companies;
  if (!Array.isArray(companies)) return [];
  return companies.find((entry) => entry.company_id === companyId)?.attachments ?? [];
}

export function mergeAttachmentRecords<T extends AttachmentRecord>(live: T[], archived: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of archived) byId.set(row.id, row);
  for (const row of live) byId.set(row.id, row);
  return [...byId.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
}
