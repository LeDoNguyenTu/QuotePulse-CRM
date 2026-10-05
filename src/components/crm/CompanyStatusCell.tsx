import type { CompanyFieldSource } from '../../lib/crm/companyEnrichment';
import { fieldSourceLabel } from '../../lib/crm/companyEnrichment';
import { displayText } from '../../lib/crm/presenters';

export function CompanyStatusCell({
  status,
  source,
  reviewRequired,
  reviewReason,
}: {
  status: string | null;
  source?: CompanyFieldSource;
  reviewRequired: boolean;
  reviewReason: string | null;
}) {
  return (
    <span className="company-status-cell">
      <span>{displayText(status)}</span>
      {status && <small className="crm-field-source">{source === 'classifier' ? 'Inferred from worksheet' : fieldSourceLabel(source)}</small>}
      {reviewRequired && (
        <span className="company-status-review" title={reviewReason ?? 'Customer status needs review'}>
          Review required
        </span>
      )}
    </span>
  );
}
