import { describe, expect, it } from 'vitest';
import type { EmailTemplate } from '../types';
import type { CrmActivity, CrmCompany, CrmContact, CrmDeal } from './types';

describe('CRM workflow type contract', () => {
  it('exposes lifecycle, outcome, activity audit, and rich template fields', () => {
    const companyStatus: CrmCompany['customer_status'] = 'Maintenance Customer';
    const companyStatusReview: CrmCompany['customer_status_review_required'] = true;
    const companyStatusReviewReason: CrmCompany['customer_status_review_reason'] = 'Conflicting worksheets';
    const contactState: CrmContact['record_state'] = 'outdated';
    const contactHidden: CrmContact['is_hidden'] = false;
    const duplicateReview: CrmContact['duplicate_review_of'] = 'newer-contact-id';
    const callOutcome: CrmDeal['call_outcome'] = 'Qualified Opportunity';
    const appointmentStatus: CrmDeal['appointment_status'] = 'Tentative';
    const activityOutcome: CrmActivity['call_outcome'] = 'Follow up';
    const activityEditor: CrmActivity['updated_by'] = 'user-id';
    const templateFormat: EmailTemplate['body_format'] = 'html';
    const templateHtml: EmailTemplate['body_html'] = '<table><tr><td>Hello</td></tr></table>';

    expect({
      companyStatus,
      companyStatusReview,
      companyStatusReviewReason,
      contactState,
      contactHidden,
      duplicateReview,
      callOutcome,
      appointmentStatus,
      activityOutcome,
      activityEditor,
      templateFormat,
      templateHtml,
    }).toEqual({
      companyStatus: 'Maintenance Customer',
      companyStatusReview: true,
      companyStatusReviewReason: 'Conflicting worksheets',
      contactState: 'outdated',
      contactHidden: false,
      duplicateReview: 'newer-contact-id',
      callOutcome: 'Qualified Opportunity',
      appointmentStatus: 'Tentative',
      activityOutcome: 'Follow up',
      activityEditor: 'user-id',
      templateFormat: 'html',
      templateHtml: '<table><tr><td>Hello</td></tr></table>',
    });
  });
});
