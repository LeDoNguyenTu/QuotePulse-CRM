import { describe, expect, it } from 'vitest';
import { fingerprintPst } from './fingerprint';
import { measureNextMetadata, METADATA_LIMIT_ERROR } from './limits';
import { MAX_PST_MESSAGES, MAX_PST_METADATA_BYTES, type PstMessageMetadata } from './types';
import { sanitizePstBody } from './sanitize';

const metadata: PstMessageMetadata = { source_key:'1',folder_path:'/Inbox',subject:'Test',sender_email:null,recipient_emails:[],message_at:null,has_attachments:false };

describe('PST local safety boundaries',()=>{
  it('fingerprints all content independently of file metadata',async()=>{
    const bytes=new Uint8Array(9*1024*1024);bytes[4*1024*1024]=1;
    const same=new Blob([bytes]);const changedBytes=bytes.slice();changedBytes[4*1024*1024]=2;
    expect(await fingerprintPst(same)).toBe(await fingerprintPst(new Blob([bytes])));
    expect(await fingerprintPst(same)).not.toBe(await fingerprintPst(new Blob([changedBytes])));
  });
  it('fails explicitly before message or metadata limits are exceeded',()=>{
    expect(()=>measureNextMetadata(MAX_PST_MESSAGES,0,metadata)).toThrow(METADATA_LIMIT_ERROR);
    expect(()=>measureNextMetadata(0,MAX_PST_METADATA_BYTES,metadata)).toThrow(METADATA_LIMIT_ERROR);
  });
  it('sanitizes and bounds stored message text',()=>{
    expect(sanitizePstBody('<script>x</script>Hello',2000)).toBe('xHello');
    expect(sanitizePstBody('abcdef',4)).toBe('abcd');
  });
});
