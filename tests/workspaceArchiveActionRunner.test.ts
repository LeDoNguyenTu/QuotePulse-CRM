import { describe, expect, it, vi } from 'vitest';
import { runResumableWorkspaceArchiveAction } from '../src/lib/workspaceArchiveActionRunner';

describe('runResumableWorkspaceArchiveAction', () => {
  it('repeats bounded steps until the server reports completion', async () => {
    const step = vi.fn()
      .mockResolvedValueOnce({ status: 'verifying' })
      .mockResolvedValueOnce({ status: 'deletion_eligible' });
    await expect(runResumableWorkspaceArchiveAction({
      step,
      isComplete: (result) => result.status === 'deletion_eligible',
      shouldStop: () => false,
    })).resolves.toMatchObject({ status: 'complete', steps: 2 });
  });

  it('stops between server-bounded steps', async () => {
    let stop = false;
    const result = await runResumableWorkspaceArchiveAction({
      step: async () => ({ status: 'deleting' }),
      isComplete: () => false,
      shouldStop: () => stop,
      onStep: () => { stop = true; },
    });
    expect(result).toEqual({ status: 'stopped', steps: 1 });
  });
});
