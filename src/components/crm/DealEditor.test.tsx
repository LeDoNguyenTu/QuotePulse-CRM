import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DealEditor } from './DealEditor';

describe('DealEditor pipeline fields', () => {
  it('renders deal stage, call outcome, and appointment status as independent inputs', () => {
    const html = renderToStaticMarkup(<DealEditor
      initial={null}
      companies={[]}
      busy={false}
      error={null}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('Stage');
    expect(html).toContain('Call outcome');
    expect(html).toContain('Appointment status');
    expect(html).toContain('name="stage"');
    expect(html).toContain('name="call_outcome"');
    expect(html).toContain('name="appointment_status"');
  });
});
