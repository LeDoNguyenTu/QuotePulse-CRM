import { act, create } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRestoreArchivedRecord } from './useArchivedCompanyBundle';

const { restoreWorkspaceArchiveRecord } = vi.hoisted(() => ({
  restoreWorkspaceArchiveRecord: vi.fn(),
}));

vi.mock('../lib/functions', () => ({
  functions: {
    restoreWorkspaceArchiveRecord,
  },
}));

describe('useRestoreArchivedRecord', () => {
  beforeEach(() => restoreWorkspaceArchiveRecord.mockReset());

  it('restores the selected child table and invalidates both archive views', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    restoreWorkspaceArchiveRecord.mockResolvedValue({ ok: true, status: 'restored' });
    let restore: ReturnType<typeof useRestoreArchivedRecord> | undefined;

    function Harness() {
      restore = useRestoreArchivedRecord('workspace-1', 'archive-1');
      return null;
    }

    await act(async () => {
      create(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    });
    await act(async () => {
      await restore!.mutateAsync({ table: 'contacts', row: { id: 'contact-1', _archive_cursor: 'cursor-1' } });
    });

    expect(restoreWorkspaceArchiveRecord).toHaveBeenCalledWith({
      workspace_id: 'workspace-1',
      archive_id: 'archive-1',
      table: 'contacts',
      cursor: 'cursor-1',
      record_id: 'contact-1',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-archive-browser', 'workspace-1', 'archive-1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['workspace-archive-company-bundle', 'workspace-1', 'archive-1'] });
  });
});
