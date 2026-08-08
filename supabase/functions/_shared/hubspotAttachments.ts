/** Placeholder names are written only when HubSpot Files metadata was unavailable. */
export function isMissingAttachmentMetadata(fileName: string | null | undefined): boolean {
  return /^file-[^./]+$/i.test(fileName?.trim() ?? '');
}
