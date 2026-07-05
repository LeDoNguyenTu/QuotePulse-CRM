// Placeholder substitution shared by the template preview and bulk-send UI.
// Server-side rendering in process-email-queue uses the same token set.
export interface RenderVars {
  company_name?: string | null;
  contact_name?: string | null;
  industry?: string | null;
  [key: string]: string | null | undefined;
}

export function renderTemplate(text: string, vars: RenderVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null || v === '' ? `{{${key}}}` : String(v);
  });
}
