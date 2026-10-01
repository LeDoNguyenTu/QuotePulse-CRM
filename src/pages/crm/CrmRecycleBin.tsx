import { useState } from "react";
import { useActiveWorkspace } from "../../hooks/useWorkspaces";
import { useCrmRecovery } from "../../hooks/crm/useCrmRecovery";
import { CrmPageHeader } from "../../components/crm/CrmPageChrome";
import { EmptyState, ErrorState, Spinner } from "../../components/ui";

type RecoveryManifest = {
  id: string;
  label: string;
  target_kind: string;
  expires_at: string;
  state: string;
};

export function CrmRecycleBin() {
  const workspace = useActiveWorkspace();
  const api = useCrmRecovery(workspace.id);
  const [purge, setPurge] = useState<RecoveryManifest | null>(null);
  const [text, setText] = useState("");
  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="30-day recovery"
        title="Recycle bin"
        description="Restore archived CRM records or permanently delete their verified R2 snapshot."
      />
      {api.list.error && <ErrorState error={api.list.error} />}
      {(api.restore.error || api.purge.error) && (
        <ErrorState error={api.restore.error ?? api.purge.error} />
      )}
      {api.list.isLoading && <Spinner label="Loading recycle bin..." />}
      {!api.list.isLoading && api.list.data?.length === 0 && (
        <EmptyState>The recycle bin is empty.</EmptyState>
      )}
      <div className="crm-task-list">
        {api.list.data?.map((item: RecoveryManifest) => (
          <article key={item.id}>
            <div>
              <strong>{item.label}</strong>
              <p>
                {item.target_kind} · expires{" "}
                {new Date(item.expires_at).toLocaleDateString("en-SG")} ·{" "}
                {item.state}
              </p>
            </div>
            <div className="flex gap-2">
              {["verified", "failed"].includes(item.state) && (
                <button
                  className="btn-secondary"
                  disabled={api.restore.isPending}
                  onClick={() => api.restore.mutate(item.id)}
                >
                  Restore
                </button>
              )}
              {["verified", "restored", "failed"].includes(item.state) && (
                <button
                  className="btn-danger"
                  disabled={api.purge.isPending}
                  onClick={() => {
                    setPurge(item);
                    setText("");
                  }}
                >
                  Delete permanently
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {purge && (
        <section className="crm-detail-panel p-4">
          <p>
            Type <strong>DELETE PERMANENTLY {purge.label}</strong> exactly.
          </p>
          <input
            className="input mt-2"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            className="btn-danger mt-2"
            disabled={
              text !== `DELETE PERMANENTLY ${purge.label}` ||
              api.purge.isPending
            }
            onClick={() =>
              api.purge.mutate(
                { manifest_id: purge.id, confirmation_text: text },
                { onSuccess: () => setPurge(null) },
              )
            }
          >
            Delete R2 archive permanently
          </button>
        </section>
      )}
    </div>
  );
}
