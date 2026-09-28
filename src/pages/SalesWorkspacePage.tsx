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

const MODULE_CONTENT: Record<string, { title: string; description: string }> = {
  settings: { title: 'Settings', description: 'Workspace-specific settings will appear as their features are introduced.' },
};

export function SalesWorkspacePage() {
  const { module, recordId } = useParams();
  const resolution = resolveSalesModule(module, recordId);
  if (resolution === 'dashboard') return <CrmDashboard />;
  if (resolution === 'companies') return <CrmCompanies />;
  if (resolution === 'contacts') return <CrmContacts />;
  if (resolution === 'deals') return <CrmDeals />;
  if (resolution === 'imports') return <CrmImports />;
  if (resolution === 'placeholder' && module === 'tasks') return <CrmTasks />;
  if (resolution === 'placeholder' && module === 'email-campaigns') return <CrmEmailCampaigns />;
  if (resolution === 'placeholder' && module === 'pst-extractor') return <CrmPstExtractor />;
  if (resolution === 'company-detail') return <CrmRecordDetailPage kind="company" recordId={recordId!} />;
  if (resolution === 'contact-detail') return <CrmRecordDetailPage kind="contact" recordId={recordId!} />;
  if (resolution === 'deal-detail') return <CrmRecordDetailPage kind="deal" recordId={recordId!} />;

  const content = resolution === 'placeholder' && module ? MODULE_CONTENT[module] : undefined;

  if (!content) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-950">Page unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">This Sales CRM module does not exist.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{content.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{content.description}</p>
      </header>
      <section className="border-l-4 border-brand-600 bg-white px-5 py-6 shadow-sm">
        <p className="text-sm font-medium text-slate-900">Workspace foundation active</p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Navigation and tenant isolation are in place. Customer data remains unchanged.
        </p>
      </section>
    </div>
  );
}
