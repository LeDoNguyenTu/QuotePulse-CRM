import { describe, expect, it, vi } from 'vitest';
import { collectCrmOptionPages } from './options';

describe('CRM option pagination', () => {
  it('collects every page until the source returns a short page', async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
      .mockResolvedValueOnce([{ id: '3' }]);

    await expect(collectCrmOptionPages(fetchPage, 2)).resolves.toEqual([
      { id: '1' }, { id: '2' }, { id: '3' },
    ]);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
  });
});
