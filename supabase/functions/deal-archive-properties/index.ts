import { errorResponse, handleOptions, json } from '../_shared/cors.ts';
import { assertDealArchivePointer, propertiesForDeal, type DealProperties } from '../_shared/dealArchive.ts';
import { getArchiveJson, verifyArchivePayload } from '../_shared/r2Archive.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';

const MAX_DEALS = 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const userId = await getUserId(req);
    const { deal_ids: requestedIds } = await req.json() as { deal_ids?: string[] };
    const dealIds = [...new Set((requestedIds ?? []).filter((id): id is string => typeof id === 'string'))];
    if (dealIds.length === 0) return json({ ok: true, properties: {} });
    if (dealIds.length > MAX_DEALS) return errorResponse(`A maximum of ${MAX_DEALS} deals can be loaded at once.`, 400);

    const admin = getAdminClient();
    const { data: rows, error } = await admin
      .from('deals')
      .select('id, hubspot_properties, r2_archive_key, r2_archive_sha256')
      .eq('owner_id', userId)
      .in('id', dealIds);
    if (error) throw error;

    const properties: Record<string, DealProperties> = {};
    const byArchive = new Map<string, typeof rows>();
    for (const row of rows ?? []) {
      const live = row.hubspot_properties as DealProperties | null;
      if (live && Object.keys(live).length > 0) {
        properties[row.id as string] = live;
      } else if (row.r2_archive_key) {
        assertDealArchivePointer(row.r2_archive_key as string, userId);
        const group = byArchive.get(row.r2_archive_key as string) ?? [];
        group.push(row);
        byArchive.set(row.r2_archive_key as string, group);
      }
    }

    const archiveGroups = [...byArchive.entries()];
    for (let offset = 0; offset < archiveGroups.length; offset += 8) {
      await Promise.all(archiveGroups.slice(offset, offset + 8).map(async ([key, archivedRows]) => {
        const expected = archivedRows[0].r2_archive_sha256 as string;
        if (archivedRows.some((row) => row.r2_archive_sha256 !== expected)) {
          throw new Error('Deals sharing an archive object have inconsistent checksums.');
        }
        const payload = await getArchiveJson<unknown>(key);
        await verifyArchivePayload(JSON.stringify(payload), expected);
        for (const row of archivedRows) {
          const archived = propertiesForDeal(payload, row.id as string);
          if (archived) properties[row.id as string] = archived;
        }
      }));
    }

    return json({ ok: true, properties });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not load archived deal properties', 500);
  }
});
