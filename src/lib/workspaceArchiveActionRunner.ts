export async function runResumableWorkspaceArchiveAction<T>(options: {
  step: () => Promise<T>;
  isComplete: (result: T) => boolean;
  shouldStop: () => boolean;
  onStep?: (result: T, stepCount: number) => void | Promise<void>;
  maxSteps?: number;
}) {
  const maxSteps = options.maxSteps ?? 1_000;
  let steps = 0;
  while (steps < maxSteps) {
    if (options.shouldStop()) return { status: 'stopped' as const, steps };
    const result = await options.step();
    steps += 1;
    await options.onStep?.(result, steps);
    if (options.isComplete(result)) return { status: 'complete' as const, steps, result };
  }
  throw new Error(`Archive action stopped after ${maxSteps.toLocaleString()} steps to prevent an unbounded loop.`);
}
