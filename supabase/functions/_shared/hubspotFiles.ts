/**
 * Temporarily disabled because the connected HubSpot account cannot grant the
 * Files scope. Attachment references are still saved with placeholder names;
 * only metadata lookups and historic metadata repair are skipped.
 */
export const HUBSPOT_FILE_METADATA_ENABLED = false;

export function hubspotAttachmentPlaceholder(fileId: string): string {
  return `file-${fileId}`;
}
