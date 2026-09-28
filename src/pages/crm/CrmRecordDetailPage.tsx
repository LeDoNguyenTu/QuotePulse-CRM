import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmDetail } from '../../hooks/crm/useCrmDetail';
import type { CrmDetailKind } from '../../lib/crm/detailQueries';
import { salesPath } from '../../lib/appRoutes';
import { CrmDetailContent } from '../../components/crm/CrmDetailContent';
import { CrmActivityComposer } from '../../components/crm/CrmActivityComposer';
import { useCrmActivityMutation } from '../../hooks/crm/useCrmActivities';
import { ErrorState, Spinner } from '../../components/ui';

const moduleByKind: Record<CrmDetailKind, string> = {
  company: 'companies',
  contact: 'contacts',
  deal: 'deals',
};

export function CrmRecordDetailPage({ kind, recordId }: { kind: CrmDetailKind; recordId: string }) {
  const workspace = useActiveWorkspace();
  const query = useCrmDetail(kind, workspace.id, recordId);
  const activity = useCrmActivityMutation(kind, workspace.id, recordId);
  return <div className="space-y-5">
    <Link className="crm-back-link" to={salesPath(workspace.id, moduleByKind[kind])}>Back to {moduleByKind[kind]}</Link>
    {Boolean(query.data?.record) && <CrmActivityComposer targetKind={kind} pending={activity.isPending} onSave={(input) => activity.mutateAsync(input)} />}
    {query.isLoading ? <div className="crm-state"><Spinner label="Loading record…" /></div> : query.error ? <ErrorState error={query.error} /> : <CrmDetailContent kind={kind} workspaceId={workspace.id} data={query.data ?? { record: null, associations: [], associationCounts: [], lineage: [], lineageCount: 0, activities: [], activityCount: 0 }} />}
  </div>;
}
