import { describe, expect, it } from 'vitest';
import {
  HUBSPOT_FILE_METADATA_ENABLED,
  hubspotAttachmentPlaceholder,
} from './hubspotFiles.ts';

describe('HubSpot Files metadata feature switch', () => {
  it('keeps Files API metadata work disabled while the account lacks that scope', () => {
    expect(HUBSPOT_FILE_METADATA_ENABLED).toBe(false);
  });

  it('retains an attachment reference with a deterministic placeholder name', () => {
    expect(hubspotAttachmentPlaceholder('98765')).toBe('file-98765');
  });
});
