import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { functions } from "../../lib/functions";
import type { CrmDeletionPreview } from "../../lib/crm/recovery";
export type RecoveryTarget = {
  kind: "workbook" | "pst" | "company" | "contact" | "deal" | "mail_message";
  id: string;
};
export function useCrmRecovery(workspaceId: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["crm", workspaceId] });
  const list = useQuery({
    queryKey: ["crm", workspaceId, "recovery"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crm_recovery_manifests")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const preview = useMutation({
    mutationFn: (target: RecoveryTarget) =>
      functions.crmRecovery<{ ok: true } & CrmDeletionPreview>({
        action: "preview",
        workspace_id: workspaceId,
        target_kind: target.kind,
        target_id: target.id,
      }),
  });
  const archiveDelete = useMutation({
    mutationFn: (input: {
      target: RecoveryTarget;
      confirmation_text: string;
      manifest_id?: string;
    }) =>
      functions.crmRecovery({
        action: "archive-delete",
        workspace_id: workspaceId,
        target_kind: input.target.kind,
        target_id: input.target.id,
        confirmation_text: input.confirmation_text,
        manifest_id: input.manifest_id,
      }),
    onSuccess: refresh,
  });
  const restore = useMutation({
    mutationFn: (manifest_id: string) =>
      functions.crmRecovery({
        action: "restore",
        workspace_id: workspaceId,
        manifest_id,
      }),
    onSuccess: refresh,
  });
  const purge = useMutation({
    mutationFn: (input: { manifest_id: string; confirmation_text: string }) =>
      functions.crmRecovery({
        action: "purge",
        workspace_id: workspaceId,
        ...input,
      }),
    onSuccess: refresh,
  });
  return { list, preview, archiveDelete, restore, purge };
}
