/// <reference lib="webworker" />
import { openPst, type IPSTFolder, type IPSTMessage } from '@hiraokahypertools/pst-extractor';
import { MAX_PST_BYTES, type PstMessageMetadata, type PstWorkerEvent } from '../lib/pst/types';
import { normalizeEmail, uniqueEmails } from '../lib/pst/normalize';
import { fingerprintPst } from '../lib/pst/fingerprint';
import { measureNextMetadata, METADATA_LIMIT_ERROR } from '../lib/pst/limits';

const scope = self as DedicatedWorkerGlobalScope;
const emit = (event: PstWorkerEvent) => scope.postMessage(event);
const safe = <T>(read: () => T, fallback: T): T => { try { return read(); } catch { return fallback; } };

scope.onmessage = async (event: MessageEvent<{ file: File }>) => {
  const file = event.data.file;
  if (!(file instanceof File) || !/\.pst$/i.test(file.name)) return emit({ type: 'error', error: 'Choose an Outlook .pst file.' });
  if (file.size <= 0 || file.size > MAX_PST_BYTES) return emit({ type: 'error', error: 'PST files must be 400 MiB or smaller.' });
  let pst: Awaited<ReturnType<typeof openPst>> | null = null;
  try {
    const fileFingerprint = await fingerprintPst(file); emit({ type: 'started', fingerprint: fileFingerprint });
    pst = await openPst({
      readFile: async (buffer, offset, length, position) => {
        const source = new Uint8Array(await file.slice(position, position + length).arrayBuffer());
        new Uint8Array(buffer).set(source, offset); return source.byteLength;
      }, close: async () => undefined,
    });
    let folders = 0, messageCount = 0, metadataBytes = 0, errors = 0; let batch: PstMessageMetadata[] = [];
    const flush = () => { if (batch.length) { emit({ type: 'batch', messages: batch }); batch = []; } };
    const messageMetadata = async (message: IPSTMessage, folderPath: string): Promise<PstMessageMetadata> => {
      let recipients: unknown[] = []; try { recipients = await message.getRecipients(); } catch { errors++; }
      const recipientEmails = uniqueEmails(recipients.flatMap((recipient: any) => [recipient.smtpAddress, recipient.emailAddress]));
      const sender = normalizeEmail(safe(() => message.senderEmailAddress, '')) ?? normalizeEmail(safe(() => message.sentRepresentingEmailAddress, ''));
      const date = safe(() => message.messageDeliveryTime, null) ?? safe(() => message.clientSubmitTime, null);
      return { source_key: String(message.primaryNodeId), folder_path: folderPath, subject: safe(() => message.subject, '').slice(0, 1000), sender_email: sender, recipient_emails: recipientEmails, message_at: date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null, has_attachments: Boolean(safe(() => message.hasAttachments, false)) };
    };
    const walk = async (folder: IPSTFolder, parent = ''): Promise<void> => {
      folders++; const name = safe(() => folder.displayName, '') || '(unnamed)'; const path = `${parent}/${name}`;
      let count = 0; try { count = await folder.getEmailCount(); } catch { errors++; }
      for (let index = 0; index < count; index++) {
        try {
          const metadata = await messageMetadata(await folder.getEmail(index), path);
          metadataBytes = measureNextMetadata(messageCount, metadataBytes, metadata);
          batch.push(metadata); messageCount++; if (batch.length >= 250) flush();
        }
        catch (error) { if (error instanceof Error && error.message === METADATA_LIMIT_ERROR) throw error; errors++; }
        if ((index + 1) % 25 === 0) emit({ type: 'progress', folders, messages: messageCount, errors });
      }
      let children: IPSTFolder[] = []; try { children = await folder.getSubFolders(); } catch { errors++; }
      for (const child of children) await walk(child, path);
    };
    await walk(await pst.getRootFolder()); flush(); emit({ type: 'complete', fingerprint: fileFingerprint, folders, messages: messageCount, errors });
  } catch (error) { emit({ type: 'error', error: error instanceof Error ? error.message : String(error) }); }
  finally { await pst?.close().catch(() => undefined); }
};
