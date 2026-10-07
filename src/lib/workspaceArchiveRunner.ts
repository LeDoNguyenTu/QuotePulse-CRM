export type WorkspaceArchiveStepResult = {
  archive_id: string;
  status: string;
};

export async function runWorkspaceArchiveToCompletion(options: {
  step: () => Promise<WorkspaceArchiveStepResult>;
  shouldStop: () => boolean;
  onStep?: (result: WorkspaceArchiveStepResult, stepCount: number) => void | Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  maxSteps?: number;
}) {
  const maxSteps = options.maxSteps ?? 10_000;
  const wait = options.wait ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let steps = 0;

  while (steps < maxSteps) {
    if (options.shouldStop()) return { status: 'stopped' as const, steps };

    const result = await options.step();
    steps += 1;
    await options.onStep?.(result, steps);

    if (result.status === 'verified') return { status: 'verified' as const, steps };
    if (!['building', 'busy'].includes(result.status)) {
      throw new Error(`Archive stopped after an unexpected server status: ${result.status}`);
    }
    if (options.shouldStop()) return { status: 'stopped' as const, steps };
    if (result.status === 'busy') await wait(1_000);
  }

  throw new Error(`Archive stopped after ${maxSteps.toLocaleString()} steps to prevent an unbounded loop.`);
}
