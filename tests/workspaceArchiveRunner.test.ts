import { describe, expect, it, vi } from 'vitest';
import { runWorkspaceArchiveToCompletion } from '../src/lib/workspaceArchiveRunner';

describe('runWorkspaceArchiveToCompletion', () => {
  it('runs bounded archive steps sequentially until the archive is verified', async () => {
    const results = [
      { archive_id: 'archive-id', status: 'building' },
      { archive_id: 'archive-id', status: 'building' },
      { archive_id: 'archive-id', status: 'verified' },
    ];
    const step = vi.fn(async () => results.shift()!);
    const onStep = vi.fn(async () => undefined);

    await expect(runWorkspaceArchiveToCompletion({
      step,
      shouldStop: () => false,
      onStep,
    })).resolves.toEqual({ status: 'verified', steps: 3 });

    expect(step).toHaveBeenCalledTimes(3);
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it('stops before beginning another step after the current step finishes', async () => {
    let stop = false;
    const step = vi.fn(async () => ({ archive_id: 'archive-id', status: 'building' }));

    await expect(runWorkspaceArchiveToCompletion({
      step,
      shouldStop: () => stop,
      onStep: () => { stop = true; },
    })).resolves.toEqual({ status: 'stopped', steps: 1 });

    expect(step).toHaveBeenCalledTimes(1);
  });

  it('backs off before retrying when another archive step holds the lease', async () => {
    const results = [
      { archive_id: 'archive-id', status: 'busy' },
      { archive_id: 'archive-id', status: 'verified' },
    ];
    const wait = vi.fn(async () => undefined);

    await runWorkspaceArchiveToCompletion({
      step: async () => results.shift()!,
      shouldStop: () => false,
      wait,
    });

    expect(wait).toHaveBeenCalledWith(1_000);
  });
});
