import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  crmDetailSpec,
  type CrmDetailData,
  type CrmDetailKind,
  type CrmDetailQuery,
} from '../../lib/crm/detailQueries';

async function fetchAssociation(querySpec: CrmDetailQuery): Promise<{ rows: unknown[]; count: number }> {
  let query = (supabase as any)
    .from(querySpec.table)
    .select(querySpec.select, { count: 'exact' })
    .eq('workspace_id', querySpec.workspaceId)
    .eq(querySpec.foreignKey, querySpec.recordId);
  if (querySpec.order) {
    query = query.order(querySpec.order.column, { ascending: querySpec.order.ascending });
  }
  if (querySpec.secondaryOrder) {
    query = query.order(querySpec.secondaryOrder.column, { ascending: querySpec.secondaryOrder.ascending });
  }
  if (querySpec.limit) query = query.limit(querySpec.limit);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data ?? [], count: count ?? 0 };
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
  const [primary, associations, lineage, activity, tasks] = await Promise.all([
    primaryPromise,
    Promise.all(spec.associations.map(fetchAssociation)),
    fetchAssociation(spec.lineage),
    fetchAssociation(spec.activity),
    fetchAssociation(spec.tasks),
  ]);
  if (primary.error) throw primary.error;
  return {
    record: primary.data ?? null,
    associations: associations.map((association) => association.rows),
    associationCounts: associations.map((association) => association.count),
    lineage: lineage.rows as CrmDetailData['lineage'],
    lineageCount: lineage.count,
    activities: activity.rows as CrmDetailData['activities'],
    activityCount: activity.count,
    tasks: tasks.rows as CrmDetailData['tasks'],
    taskCount: tasks.count,
  };
}

export function useCrmDetail(kind: CrmDetailKind, workspaceId: string, recordId: string) {
  return useQuery({
    queryKey: ['crm', workspaceId, 'detail', kind, recordId],
    queryFn: () => fetchCrmDetail(kind, workspaceId, recordId),
    enabled: Boolean(workspaceId && recordId),
  });
}
