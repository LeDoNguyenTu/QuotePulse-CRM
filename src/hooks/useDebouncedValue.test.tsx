import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

function Probe({ value, publish }: { value: string; publish: (value: string) => void }) {
  publish(useDebouncedValue(value, 250));
  return null;
}

describe('useDebouncedValue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes only the latest value after the delay', () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const publish = (value: string) => published.push(value);
    const renderer = create(<Probe value="a" publish={publish} />);

    act(() => renderer.update(<Probe value="ab" publish={publish} />));
    act(() => renderer.update(<Probe value="" publish={publish} />));
    expect(published[published.length - 1]).toBe('a');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(published[published.length - 1]).toBe('');
  });
});
