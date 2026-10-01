export interface SourceDeletionRecord {
  id: string;
  sourceIds: string[];
}
export interface CrmDeletionPreview {
  manifest_id?: string;
  target_kind: string;
  target_id: string;
  label: string;
  affected: Record<string, number>;
  detached_shared: number;
  confirmation_text: string;
  expires_at: string;
}
export function planSourceDeletion(input: {
  sourceId: string;
  records: SourceDeletionRecord[];
}) {
  return {
    detach: input.records
      .filter(
        (record) =>
          record.sourceIds.some((id) => id === input.sourceId) &&
          record.sourceIds.some((id) => id !== input.sourceId),
      )
      .map((record) => record.id),
    archive: input.records
      .filter(
        (record) =>
          record.sourceIds.length === 1 &&
          record.sourceIds[0] === input.sourceId,
      )
      .map((record) => record.id),
  };
}
export function confirmationMatches(value: string, expected: string) {
  return value === expected;
}
