import { Link } from 'react-router-dom';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';

const MODULES = [
  { path: 'companies', label: 'Companies', code: '01', description: 'Build the account directory that anchors contacts and pipeline.' },
  { path: 'contacts', label: 'Contacts', code: '02', description: 'Keep customer identities, roles, and company relationships current.' },
  { path: 'deals', label: 'Deals', code: '03', description: 'Track value, stage, status, calls, and the next follow-up.' },
];

export function CrmDashboard() {
  const workspace = useActiveWorkspace();
  const basePath = `/w/${encodeURIComponent(workspace.id)}/sales`;
  return (
    <div className="space-y-7">
      <CrmPageHeader eyebrow={workspace.name} title="Sales CRM" description="A clean operational ledger for the accounts, people, and opportunities your team is working now." />
      <section className="crm-ledger-intro">
        <p className="crm-eyebrow">Relational workspace</p>
        <h2 className="mt-2 max-w-2xl text-xl font-semibold text-slate-950">Start with a company, connect the people, then move the deal.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Every record stays inside this workspace. Owners and admins can remove records; members can create and update them.</p>
      </section>
      <div className="crm-module-grid">
        {MODULES.map((module) => (
          <Link key={module.path} to={`${basePath}/${module.path}`} className="crm-module-link">
            <span className="crm-module-code">{module.code}</span>
            <span className="text-lg font-semibold text-slate-950">{module.label}</span>
            <span className="text-sm leading-6 text-slate-600">{module.description}</span>
            <span className="crm-module-action">Open ledger<svg aria-hidden="true" viewBox="0 0 20 20"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
