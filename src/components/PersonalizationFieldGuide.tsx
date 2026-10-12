import { useState } from 'react';
import { findMissingHtmlPersonalization, PERSONALIZATION_FIELDS } from '../lib/emailPersonalization';

async function copyText(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard permissions can be blocked even on a secure page. Use the
      // browser's selection-based copy path before reporting a failure.
    }
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;

  const field = document.createElement('textarea');
  field.value = text;
  field.readOnly = true;
  field.setAttribute('data-clipboard-fallback', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.appendChild(field);
  field.focus();
  field.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

interface PersonalizationFieldGuideProps {
  bodyText: string;
  bodyHtml: string | null;
  synchronizationFailed?: boolean;
}

export function PersonalizationFieldGuide({ bodyText, bodyHtml, synchronizationFailed = false }: PersonalizationFieldGuideProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const missing = findMissingHtmlPersonalization(bodyText, bodyHtml);

  const copy = async (token: string) => {
    const succeeded = await copyText(token);
    setCopied(succeeded ? token : null);
    setCopyFailed(succeeded ? null : token);
    globalThis.setTimeout(() => {
      setCopied((current) => current === token ? null : current);
      setCopyFailed((current) => current === token ? null : current);
    }, 1_600);
  };

  return <section className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-labelledby="personalization-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 id="personalization-title" className="text-sm font-semibold text-slate-900">Personalize your email</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">
          Copy a field and paste it into Backup text where that information should appear.
        </p>
      </div>
      {bodyHtml && <span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">Formatted email</span>}
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-3">
      {PERSONALIZATION_FIELDS.map((field) => <div key={field.key} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white p-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800">{field.label}</div>
          <code className="block truncate text-[11px] text-slate-500">{field.token}</code>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          aria-label={`Copy ${field.label} field`}
          onClick={() => void copy(field.token)}
        >
          {copied === field.token ? 'Copied' : copyFailed === field.token ? 'Try again' : 'Copy'}
        </button>
      </div>)}
    </div>
    {bodyHtml && <p className="mt-2 text-xs leading-5 text-slate-600">
      Backup text edits are also applied to the matching wording in the formatted email automatically.
    </p>}
    {missing.length > 0 && <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      Your backup text uses personalization, but the formatted email is missing: <strong>{missing.map((field) => field.label).join(', ')}</strong>. Edit the matching Backup text wording again, then check the preview.
    </p>}
    {synchronizationFailed && <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      This wording could not be matched safely in the formatted email. Check the preview, or open Advanced HTML source if this template uses different backup wording.
    </p>}
  </section>;
}
