type HubspotObjectType = 'contact' | 'company' | 'deal';

const objectTypeIds: Record<HubspotObjectType, string> = {
  contact: '0-1',
  company: '0-2',
  deal: '0-3',
};

function host(uiDomain: string | null | undefined): string {
  return uiDomain?.trim() || 'app.hubspot.com';
}

export function hubspotFilePreviewUrl(portalId: string | null | undefined, uiDomain: string | null | undefined, fileId: string | null | undefined): string | null {
  if (!portalId?.trim() || !fileId?.trim()) return null;
  return `https://${host(uiDomain)}/file-preview/${encodeURIComponent(portalId)}/file/${encodeURIComponent(fileId)}/`;
}

export function hubspotRecordUrl(portalId: string | null | undefined, uiDomain: string | null | undefined, objectType: HubspotObjectType, objectId: string | null | undefined): string | null {
  if (!portalId?.trim() || !objectId?.trim()) return null;
  return `https://${host(uiDomain)}/contacts/${encodeURIComponent(portalId)}/record/${objectTypeIds[objectType]}/${encodeURIComponent(objectId)}`;
}
