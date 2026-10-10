export function appendHtmlUnsubscribe(html: string, unsubscribeUrl: string | null) {
  if (!unsubscribeUrl || /data-quotepulse-unsubscribe|\/unsubscribe\?token=/i.test(html)) return html;
  const safeUrl = unsubscribeUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `${html}<p data-quotepulse-unsubscribe="true" style="font-size:12px;color:#64748b">To stop receiving these messages, <a href="${safeUrl}">unsubscribe</a>.</p>`;
}
