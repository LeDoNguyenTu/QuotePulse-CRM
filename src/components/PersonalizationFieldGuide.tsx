import { useState } from 'react';
import { findMissingHtmlPersonalization, PERSONALIZATION_FIELDS } from '../lib/emailPersonalization';

interface PersonalizationFieldGuideProps {
  bodyText: string;
  bodyHtml: string | null;
}

export function PersonalizationFieldGuide({ bodyText, bodyHtml }: PersonalizationFieldGuideProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const missing = findMissingHtmlPersonalization(bodyText, bodyHtml);

  const copy = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(token);
    globalThis.setTimeout(() => setCopied((current) => current === token ? null : current), 1_600);
  };

  return <section className="rounded-lg border border-slate-200 bg-slate-50 p-3" aria-labelledby="personalization-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 id="personalization-title" className="text-sm font-semibold text-slate-900">Personalize your email</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">
          Copy a field, then paste it exactly where that information should appear.
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
          {copied === field.token ? 'Copied' : 'Copy'}
        </button>
      </div>)}
    </div>
    {bodyHtml && <p className="mt-2 text-xs leading-5 text-slate-600">
      For a formatted email, paste the field into <strong>HTML source</strong>. Adding it only to Backup text will not change the formatted email recipients receive.
    </p>}
    {missing.length > 0 && <p role="alert" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
      Your backup text uses personalization, but the formatted email is missing: <strong>{missing.map((field) => field.label).join(', ')}</strong>. Copy the field above and paste it into HTML source where it should appear.
    </p>}
  </section>;
}
