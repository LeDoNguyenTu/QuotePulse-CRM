import { useParams } from 'react-router-dom';
import { resolveSalesModule } from '../lib/crm/salesRoutes';
import { CrmCompanies } from './crm/CrmCompanies';
import { CrmContacts } from './crm/CrmContacts';
import { CrmDashboard } from './crm/CrmDashboard';
import { CrmDeals } from './crm/CrmDeals';
import { CrmImports } from './crm/CrmImports';
import { CrmRecordDetailPage } from './crm/CrmRecordDetailPage';
import { CrmTasks } from './crm/CrmTasks';
import { CrmEmailCampaigns } from './crm/CrmEmailCampaigns';
import { CrmPstExtractor } from './crm/CrmPstExtractor';
import { CrmSalesSettings } from './crm/CrmSalesSettings';
import { CrmRecycleBin } from './crm/CrmRecycleBin';

export function SalesWorkspacePage() {
  const { module, recordId } = useParams();
  const resolution = resolveSalesModule(module, recordId);
  if (resolution === 'dashboard') return <CrmDashboard />;
  if (resolution === 'companies') return <CrmCompanies />;
  if (resolution === 'contacts') return <CrmContacts />;
  if (resolution === 'deals') return <CrmDeals />;
  if (resolution === 'imports') return <CrmImports />;
  if (resolution === 'recycle-bin') return <CrmRecycleBin />;
  if (resolution === 'placeholder' && module === 'tasks') return <CrmTasks />;
  if (resolution === 'placeholder' && module === 'email-campaigns') return <CrmEmailCampaigns />;
  if (resolution === 'placeholder' && module === 'pst-extractor') return <CrmPstExtractor />;
  if (resolution === 'placeholder' && module === 'settings') return <CrmSalesSettings />;
  if (resolution === 'company-detail') return <CrmRecordDetailPage kind="company" recordId={recordId!} />;
  if (resolution === 'contact-detail') return <CrmRecordDetailPage kind="contact" recordId={recordId!} />;
  if (resolution === 'deal-detail') return <CrmRecordDetailPage kind="deal" recordId={recordId!} />;

  return (
    <section className="crm-detail-panel p-6">
      <h1 className="text-2xl font-semibold text-slate-950">Page unavailable</h1>
      <p className="mt-2 text-sm text-slate-600">This Sales CRM module does not exist.</p>
    </section>
  );
}
