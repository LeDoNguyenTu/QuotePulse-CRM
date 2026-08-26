import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ImportRecoveryWarning } from './ImportRecoveryWarning';

describe('HubSpot import recovery warning', () => {
  it('shows the pending count and archive countdown while imports are locked', () => {
    const html = renderToStaticMarkup(
      <ImportRecoveryWarning
        lock={{
          locked: true,
          phase: 'archiving',
          pendingSnapshots: 55_000,
          estimatedArchiveCompleteAt: Date.parse('2026-08-27T07:14:00.000Z'),
          message: 'Storage recovery is moving deal snapshots to R2.',
        }}
        now={Date.parse('2026-08-27T02:39:00.000Z')}
      />,
    );

    expect(html).toContain('HubSpot import temporarily disabled');
    expect(html).toContain('55,000');
    expect(html).toContain('04:35:00');
  });

  it('explains that compaction is required without showing a false countdown', () => {
    const html = renderToStaticMarkup(
      <ImportRecoveryWarning
        lock={{
          locked: true,
          phase: 'compaction-required',
          pendingSnapshots: 0,
          estimatedArchiveCompleteAt: null,
          message: 'The archive is complete; database compaction is required.',
        }}
        now={Date.parse('2026-08-27T07:14:00.000Z')}
      />,
    );

    expect(html).toContain('database compaction is required');
    expect(html).not.toContain('Estimated R2 archive countdown');
  });

  it('renders nothing after storage recovery is verified', () => {
    expect(renderToStaticMarkup(
      <ImportRecoveryWarning
        lock={{
          locked: false,
          phase: 'ready',
          pendingSnapshots: 0,
          estimatedArchiveCompleteAt: null,
          message: 'Storage recovery is complete.',
        }}
        now={Date.parse('2026-08-27T07:20:00.000Z')}
      />,
    )).toBe('');
  });
});
