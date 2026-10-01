import { handleOptions, json, errorResponse } from "../_shared/cors.ts";
import { getAdminClient, getUserId } from "../_shared/supabaseAdmin.ts";
import {
  deleteArchiveObject,
  getArchiveJson,
  putVerifiedArchive,
  verifyArchivePayload,
} from "../_shared/r2Archive.ts";
import {
  archiveThenDelete,
  assertRecoveryPointer,
  recoveryArchiveKey,
} from "../_shared/crmRecovery.ts";

type Admin = ReturnType<typeof getAdminClient>;
type TargetKind =
  "workbook" | "pst" | "company" | "contact" | "deal" | "mail_message";
const tableFor: Record<Exclude<TargetKind, "workbook" | "pst">, string> = {
  company: "crm_companies",
  contact: "crm_contacts",
  deal: "crm_deals",
  mail_message: "crm_mail_messages",
};
async function rows(
  admin: Admin,
  table: string,
  workspaceId: string,
  ids: string[],
) {
  if (!ids.length) return [];
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

async function relatedRows(
  admin: Admin,
  table: string,
  workspaceId: string,
  column: string,
  targetId: string,
) {
  const { data, error } = await admin
    .from(table)
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq(column, targetId);
  if (error) throw error;
  return data ?? [];
}
async function snapshot(
  admin: Admin,
  workspaceId: string,
  kind: TargetKind,
  targetId: string,
) {
  if (kind === "workbook") {
    const { data: source, error } = await admin
      .from("crm_source_imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!source) throw new Error("Workbook source not found.");
    const { data: refs, error: refError } = await admin
      .from("crm_source_references")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("source_import_id", targetId);
    if (refError) throw refError;
    const ids = (key: string) => [
      ...new Set(
        (refs ?? [])
          .map((r: any) => r[key])
          .filter(Boolean)
          .map(String),
      ),
    ];
    const companyIds = ids("company_id"),
      contactIds = ids("contact_id"),
      dealIds = ids("deal_id");
    const allIds = [...companyIds, ...contactIds, ...dealIds];
    const { data: otherRefs, error: otherError } = allIds.length
      ? await admin
          .from("crm_source_references")
          .select("source_import_id,company_id,contact_id,deal_id")
          .eq("workspace_id", workspaceId)
          .neq("source_import_id", targetId)
          .or(
            `company_id.in.(${companyIds.join(",") || "00000000-0000-0000-0000-000000000000"}),contact_id.in.(${contactIds.join(",") || "00000000-0000-0000-0000-000000000000"}),deal_id.in.(${dealIds.join(",") || "00000000-0000-0000-0000-000000000000"})`,
          )
      : { data: [], error: null };
    if (otherError) throw otherError;
    const sharedCompanies = new Set(
      (otherRefs ?? []).map((r: any) => r.company_id).filter(Boolean),
    );
    const sharedContacts = new Set(
      (otherRefs ?? []).map((r: any) => r.contact_id).filter(Boolean),
    );
    const sharedDeals = new Set(
      (otherRefs ?? []).map((r: any) => r.deal_id).filter(Boolean),
    );
    const exclusiveCompanies = companyIds.filter(
        (id) => !sharedCompanies.has(id),
      ),
      exclusiveContacts = contactIds.filter((id) => !sharedContacts.has(id)),
      exclusiveDeals = dealIds.filter((id) => !sharedDeals.has(id));
    const [companies, contacts, deals, activities, tasks] = await Promise.all([
      rows(admin, "crm_companies", workspaceId, exclusiveCompanies),
      rows(admin, "crm_contacts", workspaceId, exclusiveContacts),
      rows(admin, "crm_deals", workspaceId, exclusiveDeals),
      (async () => {
        const { data, error } = await admin
          .from("crm_activities")
          .select("*")
          .eq("workspace_id", workspaceId)
          .or(
            `source_import_id.eq.${targetId},company_id.in.(${exclusiveCompanies.join(",") || "00000000-0000-0000-0000-000000000000"}),contact_id.in.(${exclusiveContacts.join(",") || "00000000-0000-0000-0000-000000000000"}),deal_id.in.(${exclusiveDeals.join(",") || "00000000-0000-0000-0000-000000000000"})`,
          );
        if (error) throw error;
        return data ?? [];
      })(),
      (async () => {
        const { data, error } = await admin
          .from("crm_tasks")
          .select("*")
          .eq("workspace_id", workspaceId)
          .or(
            `company_id.in.(${exclusiveCompanies.join(",") || "00000000-0000-0000-0000-000000000000"}),contact_id.in.(${exclusiveContacts.join(",") || "00000000-0000-0000-0000-000000000000"}),deal_id.in.(${exclusiveDeals.join(",") || "00000000-0000-0000-0000-000000000000"})`,
          );
        if (error) throw error;
        return data ?? [];
      })(),
    ]);
    const { data: dealContacts, error: dcError } =
      dealIds.length || exclusiveContacts.length
        ? await admin
            .from("crm_deal_contacts")
            .select("*")
            .eq("workspace_id", workspaceId)
            .or(
              `deal_id.in.(${dealIds.join(",") || "00000000-0000-0000-0000-000000000000"}),contact_id.in.(${exclusiveContacts.join(",") || "00000000-0000-0000-0000-000000000000"})`,
            )
        : { data: [], error: null };
    if (dcError) throw dcError;
    return {
      format: "crm-recovery.v1",
      kind,
      workspace_id: workspaceId,
      target_id: targetId,
      label: source.original_filename,
      source,
      refs,
      companies,
      contacts,
      deals,
      activities,
      tasks,
      deal_contacts: dealContacts ?? [],
      shared_count:
        sharedCompanies.size + sharedContacts.size + sharedDeals.size,
    };
  }
  if (kind === "pst") {
    const { data: source, error } = await admin
      .from("crm_mailbox_imports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", targetId)
      .maybeSingle();
    if (error) throw error;
    if (!source) throw new Error("PST source not found.");
    const { data: messages, error: messageError } = await admin
      .from("crm_mail_messages")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("mailbox_import_id", targetId);
    if (messageError) throw messageError;
    const messageIds = (messages ?? []).map((m: any) => m.id);
    const { data: links, error: linkError } = messageIds.length
      ? await admin
          .from("crm_mail_message_contacts")
          .select("*")
          .eq("workspace_id", workspaceId)
          .in("mail_message_id", messageIds)
      : { data: [], error: null };
    if (linkError) throw linkError;
    return {
      format: "crm-recovery.v1",
      kind,
      workspace_id: workspaceId,
      target_id: targetId,
      label: source.file_name,
      source,
      messages: messages ?? [],
      message_contacts: links ?? [],
      shared_count: new Set((links ?? []).map((link: any) => link.contact_id))
        .size,
    };
  }
  const table = tableFor[kind as keyof typeof tableFor];
  if (!table) throw new Error("Unsupported CRM recovery target.");
  const record = (await rows(admin, table, workspaceId, [targetId]))[0];
  if (!record) throw new Error("CRM record not found.");
  const relationColumn = `${kind}_id`;
  const [
    sourceReferences,
    dealContacts,
    activities,
    tasks,
    messageContacts,
    companyContacts,
    companyDeals,
  ] = await Promise.all([
    kind === "mail_message"
      ? []
      : relatedRows(
          admin,
          "crm_source_references",
          workspaceId,
          relationColumn,
          targetId,
        ),
    kind === "contact" || kind === "deal"
      ? relatedRows(
          admin,
          "crm_deal_contacts",
          workspaceId,
          relationColumn,
          targetId,
        )
      : [],
    kind === "company" || kind === "contact" || kind === "deal"
      ? relatedRows(
          admin,
          "crm_activities",
          workspaceId,
          relationColumn,
          targetId,
        )
      : [],
    kind === "company" || kind === "contact" || kind === "deal"
      ? relatedRows(admin, "crm_tasks", workspaceId, relationColumn, targetId)
      : [],
    kind === "contact" || kind === "mail_message"
      ? relatedRows(
          admin,
          "crm_mail_message_contacts",
          workspaceId,
          relationColumn,
          targetId,
        )
      : [],
    kind === "company"
      ? relatedRows(admin, "crm_contacts", workspaceId, "company_id", targetId)
      : [],
    kind === "company"
      ? relatedRows(admin, "crm_deals", workspaceId, "company_id", targetId)
      : [],
  ]);
  return {
    format: "crm-recovery.v1",
    kind,
    workspace_id: workspaceId,
    target_id: targetId,
    label: record.name ?? record.full_name ?? record.subject ?? targetId,
    record,
    source_references: sourceReferences,
    deal_contacts: dealContacts,
    activities,
    tasks,
    message_contacts: messageContacts,
    company_contact_ids: companyContacts.map((item: any) => item.id),
    company_deal_ids: companyDeals.map((item: any) => item.id),
    shared_count: 0,
  };
}
function counts(payload: any) {
  return payload.kind === "workbook"
    ? {
        companies: payload.companies.length,
        contacts: payload.contacts.length,
        deals: payload.deals.length,
        activities: payload.activities.length,
        tasks: payload.tasks.length,
      }
    : payload.kind === "pst"
      ? {
          messages: payload.messages.length,
          contacts_preserved: payload.shared_count,
        }
      : {
          records: 1,
          relationships: [
            ...(payload.source_references ?? []),
            ...(payload.deal_contacts ?? []),
            ...(payload.activities ?? []),
            ...(payload.tasks ?? []),
            ...(payload.message_contacts ?? []),
            ...(payload.company_contact_ids ?? []),
            ...(payload.company_deal_ids ?? []),
          ].length,
        };
}

async function transition(
  admin: Admin,
  manifestId: string,
  workspaceId: string,
  expected: string,
  next: string,
  actorId: string,
  errorMessage: string | null = null,
) {
  const { data, error } = await admin.rpc("crm_transition_recovery_manifest", {
    p_manifest_id: manifestId,
    p_workspace_id: workspaceId,
    p_expected: expected,
    p_next: next,
    p_actor_id: actorId,
    p_error: errorMessage,
  });
  if (error) throw error;
  if (!data) throw new Error("Recovery state transition did not complete.");
  return data;
}
async function upsert(
  admin: Admin,
  table: string,
  value: any,
  onConflict?: string,
) {
  const items = Array.isArray(value) ? value : [value];
  if (!items.length) return;
  const { error } = await admin
    .from(table)
    .upsert(items, onConflict ? { onConflict } : undefined);
  if (error) throw error;
}
async function restore(admin: Admin, payload: any) {
  if (payload.kind === "workbook") {
    await upsert(admin, "crm_source_imports", payload.source);
    for (const [name, table] of [
      ["companies", "crm_companies"],
      ["contacts", "crm_contacts"],
      ["deals", "crm_deals"],
      ["deal_contacts", "crm_deal_contacts"],
      ["activities", "crm_activities"],
      ["tasks", "crm_tasks"],
      ["refs", "crm_source_references"],
    ] as const)
      await upsert(admin, table, payload[name]);
  } else if (payload.kind === "pst") {
    await upsert(admin, "crm_mailbox_imports", payload.source);
    await upsert(admin, "crm_mail_messages", payload.messages);
    await upsert(admin, "crm_mail_message_contacts", payload.message_contacts);
  } else {
    await upsert(
      admin,
      tableFor[payload.kind as keyof typeof tableFor],
      payload.record,
    );
    if (payload.kind === "company") {
      for (const [table, ids] of [
        ["crm_contacts", payload.company_contact_ids ?? []],
        ["crm_deals", payload.company_deal_ids ?? []],
      ] as const) {
        if (!ids.length) continue;
        const { error } = await admin
          .from(table)
          .update({ company_id: payload.target_id })
          .eq("workspace_id", payload.workspace_id)
          .in("id", ids)
          .is("company_id", null);
        if (error) throw error;
      }
    }
    for (const [name, table] of [
      ["source_references", "crm_source_references"],
      ["deal_contacts", "crm_deal_contacts"],
      ["activities", "crm_activities"],
      ["tasks", "crm_tasks"],
      ["message_contacts", "crm_mail_message_contacts"],
    ] as const) {
      await upsert(admin, table, payload[name] ?? []);
    }
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const workspaceId = String(body.workspace_id ?? "");
    const admin = getAdminClient();
    const { data: member, error: memberError } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member || !["owner", "admin"].includes(member.role))
      return errorResponse("Workspace owner or admin required.", 403);
    if (action === "preview") {
      const payload = await snapshot(
        admin,
        workspaceId,
        String(body.target_kind) as TargetKind,
        String(body.target_id),
      );
      return json({
        ok: true,
        manifest_id: crypto.randomUUID(),
        target_kind: payload.kind,
        target_id: payload.target_id,
        label: payload.label,
        affected: counts(payload),
        detached_shared: payload.shared_count,
        confirmation_text: `DELETE ${payload.label}`,
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
    }
    if (action === "archive-delete") {
      const kind = String(body.target_kind) as TargetKind,
        targetId = String(body.target_id);
      const manifestId = String(body.manifest_id ?? crypto.randomUUID());
      const { data: existingManifest, error: existingError } = await admin
        .from("crm_recovery_manifests")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("id", manifestId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (
        existingManifest &&
        (existingManifest.target_kind !== kind ||
          existingManifest.target_id !== targetId ||
          existingManifest.created_by !== userId)
      ) {
        return errorResponse(
          "Recovery manifest does not match this target.",
          409,
        );
      }
      if (existingManifest?.state === "verified") {
        if (!existingManifest.hot_deleted_at) {
          const { error } = await admin.rpc("crm_apply_recovery_delete", {
            p_manifest_id: manifestId,
            p_actor_id: userId,
          });
          if (error) throw error;
        }
        return json({
          ok: true,
          manifest_id: manifestId,
          archive: {
            key: existingManifest.archive_r2_key,
            checksum: existingManifest.archive_sha256,
          },
        });
      }
      if (
        existingManifest &&
        !["building", "failed"].includes(existingManifest.state)
      ) {
        return errorResponse("Recovery manifest state cannot be retried.", 409);
      }
      const payload = await snapshot(admin, workspaceId, kind, targetId);
      if (body.confirmation_text !== `DELETE ${payload.label}`)
        return errorResponse("Confirmation text does not match.", 400);
      const key = recoveryArchiveKey(userId, workspaceId, manifestId);
      if (existingManifest) {
        const { data, error } = await admin
          .from("crm_recovery_manifests")
          .update({ state: "building", last_error: null })
          .eq("workspace_id", workspaceId)
          .eq("id", manifestId)
          .in("state", ["building", "failed"])
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data)
          return errorResponse("Recovery manifest is already in use.", 409);
      } else {
        const { error: insertError } = await admin
          .from("crm_recovery_manifests")
          .insert({
            id: manifestId,
            workspace_id: workspaceId,
            target_kind: kind,
            target_id: targetId,
            label: payload.label,
            affected_counts: counts(payload),
            detached_shared: payload.shared_count,
            created_by: userId,
          });
        if (insertError) throw insertError;
      }
      let archive: { key: string; checksum: string };
      try {
        archive = await archiveThenDelete(
          {
            putArchive: () => putVerifiedArchive(key, payload),
            verifyArchive: async (k, c) => {
              assertRecoveryPointer(k, userId, workspaceId, manifestId);
              const downloaded = await getArchiveJson(k);
              await verifyArchivePayload(JSON.stringify(downloaded), c);
            },
            recordVerified: async (stored) => {
              const { data, error } = await admin
                .from("crm_recovery_manifests")
                .update({
                  state: "verified",
                  archive_r2_key: stored.key,
                  archive_sha256: stored.checksum,
                  archive_row_count: Object.values(counts(payload)).reduce(
                    (a: number, b: any) => a + Number(b),
                    0,
                  ),
                })
                .eq("workspace_id", workspaceId)
                .eq("id", manifestId)
                .eq("state", "building")
                .select("id")
                .maybeSingle();
              if (error) throw error;
              if (!data)
                throw new Error(
                  "Recovery manifest was not available to verify.",
                );
            },
            deleteHotRows: async () => {
              const { error } = await admin.rpc("crm_apply_recovery_delete", {
                p_manifest_id: manifestId,
                p_actor_id: userId,
              });
              if (error) throw error;
            },
          },
          { payload },
        );
      } catch (error) {
        await admin
          .from("crm_recovery_manifests")
          .update({
            state: "failed",
            last_error: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, 2000),
          })
          .eq("workspace_id", workspaceId)
          .eq("id", manifestId)
          .eq("state", "building");
        throw error;
      }
      return json({ ok: true, manifest_id: manifestId, archive });
    }
    const manifestId = String(body.manifest_id ?? "");
    const { data: manifest, error: manifestError } = await admin
      .from("crm_recovery_manifests")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", manifestId)
      .maybeSingle();
    if (manifestError) throw manifestError;
    if (!manifest) {
      if (action === "purge") return json({ ok: true, already_purged: true });
      return errorResponse("Recovery item not found.", 404);
    }
    if (action === "restore") {
      if (manifest.state === "restored")
        return json({ ok: true, already_restored: true });
      if (!["verified", "failed"].includes(manifest.state))
        return errorResponse("Recovery item is not ready to restore.", 409);
      if (!manifest.archive_r2_key || !manifest.archive_sha256)
        return errorResponse("Recovery archive is unavailable.", 409);
      assertRecoveryPointer(
        manifest.archive_r2_key,
        String(manifest.created_by),
        workspaceId,
        manifestId,
      );
      await transition(
        admin,
        manifestId,
        workspaceId,
        manifest.state,
        "restoring",
        userId,
      );
      try {
        const payload = await getArchiveJson<any>(manifest.archive_r2_key);
        await verifyArchivePayload(
          JSON.stringify(payload),
          manifest.archive_sha256,
        );
        if (payload.workspace_id !== workspaceId)
          throw new Error("Recovery archive workspace mismatch.");
        await restore(admin, payload);
        await transition(
          admin,
          manifestId,
          workspaceId,
          "restoring",
          "restored",
          userId,
        );
        return json({ ok: true });
      } catch (error) {
        await transition(
          admin,
          manifestId,
          workspaceId,
          "restoring",
          "failed",
          userId,
          error instanceof Error ? error.message : String(error),
        ).catch(() => undefined);
        throw error;
      }
    }
    if (action === "purge") {
      if (body.confirmation_text !== `DELETE PERMANENTLY ${manifest.label}`)
        return errorResponse(
          "Permanent deletion confirmation does not match.",
          400,
        );
      const { data: claimed, error: stateError } = await admin
        .from("crm_recovery_manifests")
        .update({ state: "purging" })
        .eq("workspace_id", workspaceId)
        .eq("id", manifestId)
        .in("state", ["verified", "restored", "failed"])
        .select("id")
        .maybeSingle();
      if (stateError) throw stateError;
      if (!claimed)
        throw new Error("Recovery item state changed; refresh and retry.");
      try {
        if (manifest.archive_r2_key) {
          assertRecoveryPointer(
            manifest.archive_r2_key,
            String(manifest.created_by),
            workspaceId,
            manifestId,
          );
          await deleteArchiveObject(manifest.archive_r2_key);
        }
        const { data: removed, error } = await admin
          .from("crm_recovery_manifests")
          .delete()
          .eq("workspace_id", workspaceId)
          .eq("id", manifestId)
          .eq("state", "purging")
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!removed)
          throw new Error("Recovery item was not removed after R2 deletion.");
      } catch (error) {
        await admin
          .from("crm_recovery_manifests")
          .update({
            state: "failed",
            last_error: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, 2000),
          })
          .eq("workspace_id", workspaceId)
          .eq("id", manifestId)
          .eq("state", "purging");
        throw error;
      }
      return json({ ok: true });
    }
    return errorResponse("Unsupported recovery action.", 400);
  } catch (error) {
    return errorResponse(
      error instanceof Error ? error.message : String(error),
      500,
    );
  }
});
