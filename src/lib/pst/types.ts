export interface PstMessageMetadata {
  source_key: string;
  folder_path: string;
  subject: string;
  sender_email: string | null;
  recipient_emails: string[];
  message_at: string | null;
  has_attachments: boolean;
  sender_display_name?: string | null;
  participant_names?: Record<string, string>;
  body_text?: string;
  body_preview?: string;
}

export interface PstMessageArchiveV1 {
  format: 'crm-pst-message-archive.v1';
  workspace_id: string;
  mailbox_import_id: string;
  source_filename: string;
  messages: PstMessageMetadata[];
}

export type PstWorkerEvent =
  | { type: 'started'; fingerprint: string }
  | { type: 'progress'; folders: number; messages: number; errors: number }
  | { type: 'batch'; messages: PstMessageMetadata[] }
  | { type: 'complete'; fingerprint: string; folders: number; messages: number; errors: number }
  | { type: 'error'; error: string };

export const MAX_PST_BYTES = 400 * 1024 * 1024;
export const MAX_PST_MESSAGES = 25_000;
export const MAX_PST_METADATA_BYTES = 64 * 1024 * 1024;
