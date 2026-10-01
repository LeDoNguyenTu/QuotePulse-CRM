import { useEffect, useState } from "react";
import { Modal } from "../Modal";
import { ErrorState } from "../ui";
import { confirmationMatches } from "../../lib/crm/recovery";
import {
  useCrmRecovery,
  type RecoveryTarget,
} from "../../hooks/crm/useCrmRecovery";
export function CrmDeleteSourceDialog({
  workspaceId,
  target,
  onClose,
  onDeleted,
}: {
  workspaceId: string;
  target: (RecoveryTarget & { label: string }) | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const api = useCrmRecovery(workspaceId);
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
    if (target) api.preview.mutate(target);
    else api.preview.reset();
  }, [target]);
  const preview = api.preview.data;
  const expected = preview?.confirmation_text ?? "";
  const remove = () => {
    if (!target || !confirmationMatches(text, expected)) return;
    api.archiveDelete.mutate(
      {
        target,
        confirmation_text: text,
        manifest_id: preview?.manifest_id,
      },
      {
        onSuccess: () => {
          onDeleted?.();
          onClose();
        },
      },
    );
  };
  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Move to recycle bin">
      <div className="space-y-4">
        <p>
          Archive and remove <strong>{target?.label}</strong>. It can be
          restored for 30 days.
        </p>
        {preview && (
          <>
            <p className="text-sm">
              Affected:{" "}
              {Object.entries(preview.affected)
                .map(([key, value]) => `${value} ${key}`)
                .join(", ")}
              . Shared records preserved: {preview.detached_shared}.
            </p>
            <p className="text-sm">
              Type <strong>{expected}</strong> exactly to confirm.
            </p>
            <input
              className="input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-label="Deletion confirmation"
            />
          </>
        )}
        {(api.preview.error || api.archiveDelete.error) && (
          <ErrorState error={api.preview.error ?? api.archiveDelete.error} />
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={
              !confirmationMatches(text, expected) ||
              api.archiveDelete.isPending
            }
            onClick={remove}
          >
            {api.archiveDelete.isPending ? "Archiving…" : "Move to recycle bin"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
