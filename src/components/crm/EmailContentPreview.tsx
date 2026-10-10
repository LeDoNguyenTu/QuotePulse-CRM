export function EmailContentPreview({ subject, bodyText, bodyHtml }: { subject: string | null; bodyText: string | null; bodyHtml: string | null }) {
  return <details className="crm-email-content">
    <summary>View sent content</summary>
    <div className="crm-email-content__subject"><strong>Subject</strong><span>{subject || '(no subject)'}</span></div>
    {bodyHtml ? <iframe title={`Stored email preview: ${subject || 'No subject'}`} sandbox="" srcDoc={bodyHtml} /> : null}
    <details><summary>Plain-text fallback</summary><pre>{bodyText || '(empty message)'}</pre></details>
  </details>;
}
