import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmDetail } from '../../hooks/crm/useCrmDetail';
import type { CrmDetailKind } from '../../lib/crm/detailQueries';
import { salesPath } from '../../lib/appRoutes';
import { CrmDetailContent } from '../../components/crm/CrmDetailContent';
import { CrmActivityComposer } from '../../components/crm/CrmActivityComposer';
import { useCrmActivityMutation, useCrmActivityUpdateMutation, useWorkspaceMemberOptions } from '../../hooks/crm/useCrmActivities';
import { ErrorState, Spinner } from '../../components/ui';
import { activityDestinationsFromLineage } from '../../lib/crm/activityExport';
import { useCrmEmailHistory } from '../../hooks/crm/useCrmEmailHistory';
import { useRetryFailedEmail } from '../../hooks/crm/useCrmCampaigns';

const moduleByKind: Record<CrmDetailKind, string> = {
  company: 'companies',
  contact: 'contacts',
  deal: 'deals',
};

export function CrmRecordDetailPage({ kind, recordId }: { kind: CrmDetailKind; recordId: string }) {
  const workspace = useActiveWorkspace();
  const query = useCrmDetail(kind, workspace.id, recordId);
  const activity = useCrmActivityMutation(kind, workspace.id, recordId);
  const activityUpdate = useCrmActivityUpdateMutation(kind, workspace.id, recordId);
  const members = useWorkspaceMemberOptions(workspace.id);
  const emailHistory = useCrmEmailHistory(workspace.id, kind === 'contact' ? recordId : null);
  const retryFailedEmail = useRetryFailedEmail(workspace.id);
  const destinations = activityDestinationsFromLineage(query.data?.lineage ?? []);
  return <div className="space-y-5">
    <Link className="crm-back-link" to={salesPath(workspace.id, moduleByKind[kind])}>Back to {moduleByKind[kind]}</Link>
    {Boolean(query.data?.record) && <CrmActivityComposer targetKind={kind} pending={activity.isPending} members={members.data ?? []} destinations={destinations} onSave={(input) => activity.mutateAsync(input)} />}
    {query.isLoading ? <div className="crm-state"><Spinner label="Loading record…" /></div> : query.error ? <ErrorState error={query.error} /> : <CrmDetailContent kind={kind} workspaceId={workspace.id} activityPending={activityUpdate.isPending} onEditActivity={(activityId, input) => activityUpdate.mutateAsync({ activityId, input })} emailHistory={kind === 'contact' ? emailHistory.data ?? [] : undefined} emailHistoryLoading={kind === 'contact' && emailHistory.isLoading} emailHistoryError={kind === 'contact' ? emailHistory.error : null} retryingEmailId={retryFailedEmail.isPending ? retryFailedEmail.variables ?? null : null} onRetryEmail={(sendId) => void retryFailedEmail.mutateAsync(sendId)} data={query.data ?? { record: null, associations: [], associationCounts: [], lineage: [], lineageCount: 0, activities: [], activityCount: 0 }} />}
  </div>;
}
