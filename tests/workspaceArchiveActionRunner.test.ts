import { describe, expect, it, vi } from 'vitest';
import { runResumableWorkspaceArchiveAction, runWorkspaceRestoreToCompletion } from '../src/lib/workspaceArchiveActionRunner';

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

  it('restores archives larger than the generic 1,000-step safety limit', async () => {
    let steps = 0;
    const result = await runWorkspaceRestoreToCompletion({
      step: async () => ({ status: ++steps === 1_002 ? 'restored' : 'restoring' }),
      shouldStop: () => false,
    });

    expect(result).toMatchObject({ status: 'complete', steps: 1_002 });
  });
});
