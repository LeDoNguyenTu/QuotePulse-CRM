import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  crmDetailSpec,
  type CrmDetailData,
  type CrmDetailKind,
  type CrmDetailQuery,
} from '../../lib/crm/detailQueries';

async function fetchAssociation(querySpec: CrmDetailQuery): Promise<unknown[]> {
  let query = (supabase as any)
    .from(querySpec.table)
    .select(querySpec.select)
    .eq('workspace_id', querySpec.workspaceId)
    .eq(querySpec.foreignKey, querySpec.recordId);
  if (querySpec.order) {
    query = query.order(querySpec.order.column, { ascending: querySpec.order.ascending });
  }
  if (querySpec.limit) query = query.limit(querySpec.limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchCrmDetail(
  kind: CrmDetailKind,
  workspaceId: string,
  recordId: string,
): Promise<CrmDetailData> {
  const spec = crmDetailSpec(kind, workspaceId, recordId);
  const primaryPromise = (supabase as any)
    .from(spec.primary.table)
    .select(spec.primary.select)
    .eq('workspace_id', workspaceId)
    .eq('id', recordId)
    .maybeSingle();
  const [primary, associations, lineage] = await Promise.all([
    primaryPromise,
    Promise.all(spec.associations.map(fetchAssociation)),
    fetchAssociation(spec.lineage),
  ]);
  if (primary.error) throw primary.error;
  return { record: primary.data ?? null, associations, lineage: lineage as CrmDetailData['lineage'] };
}

export function useCrmDetail(kind: CrmDetailKind, workspaceId: string, recordId: string) {
  return useQuery({
    queryKey: ['crm', workspaceId, 'detail', kind, recordId],
    queryFn: () => fetchCrmDetail(kind, workspaceId, recordId),
    enabled: Boolean(workspaceId && recordId),
  });
}
