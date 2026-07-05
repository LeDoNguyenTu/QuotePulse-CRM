import { useState } from 'react';
import { useDeleteTemplate, useSaveTemplate, useTemplates } from '../hooks/useTemplates';
import { TemplateEditor } from '../components/TemplateEditor';
import { EmptyState, ErrorState, Spinner } from '../components/ui';
import type { EmailTemplate } from '../lib/types';

export function Templates() {
  const { data, isLoading, error } = useTemplates();
  const save = useSaveTemplate();
  const del = useDeleteTemplate();
  const [editing, setEditing] = useState<Partial<EmailTemplate> | null>(null);
  const [open, setOpen] = useState(false);

  function edit(t: Partial<EmailTemplate> | null) {
    setEditing(t);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Email templates</h1>
        <button className="btn-primary" onClick={() => edit({})}>
          + New template
        </button>
      </div>

      {error && <ErrorState error={error} />}
      {isLoading ? (
        <Spinner />
      ) : data && data.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <div key={t.id} className="card flex flex-col p-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{t.name}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {t.industry ?? 'generic'}
                </span>
              </div>
              <div className="text-sm text-slate-600">{t.subject}</div>
              <p className="mt-2 line-clamp-3 text-xs text-slate-400">{t.body}</p>
              <div className="mt-3 flex gap-2">
                <button className="btn-secondary" onClick={() => edit(t)}>
                  Edit
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) del.mutate(t.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No templates yet. Create your first one.</EmptyState>
      )}

      <TemplateEditor
        open={open}
        initial={editing}
        onClose={() => setOpen(false)}
        onSave={async (t) => {
          await save.mutateAsync(t);
        }}
      />
    </div>
  );
}
