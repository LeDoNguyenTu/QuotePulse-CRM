import { useParams } from 'react-router-dom';
import { resolveSalesModule } from '../lib/crm/salesRoutes';
import { CrmCompanies } from './crm/CrmCompanies';
import { CrmContacts } from './crm/CrmContacts';
import { CrmDashboard } from './crm/CrmDashboard';
import { CrmDeals } from './crm/CrmDeals';

const MODULE_CONTENT: Record<string, { title: string; description: string }> = {
  tasks: { title: 'Tasks', description: 'Follow-up tasks and durable reminders arrive in Phase F.' },
  'email-campaigns': { title: 'Email Campaigns', description: 'Campaign audiences will reuse the existing durable email queue in Phase G.' },
  imports: { title: 'Imports', description: 'Workbook mapping and Database ID lineage arrive in Phase C.' },
  'pst-extractor': { title: 'PST Extractor', description: 'PST support begins with a fixture-backed parser spike in Phase H.' },
  settings: { title: 'Settings', description: 'Workspace-specific settings will appear as their features are introduced.' },
};

export function SalesWorkspacePage() {
  const { module } = useParams();
  const resolution = resolveSalesModule(module);
  if (resolution === 'dashboard') return <CrmDashboard />;
  if (resolution === 'companies') return <CrmCompanies />;
  if (resolution === 'contacts') return <CrmContacts />;
  if (resolution === 'deals') return <CrmDeals />;

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
