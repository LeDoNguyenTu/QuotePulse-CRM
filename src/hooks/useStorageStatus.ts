import { useQuery } from '@tanstack/react-query';
import { accountQueryKey } from '../lib/accountQueryScope';
import { functions } from '../lib/functions';
import { storageStatusPollInterval } from '../lib/storageStatus';
import { useAuth } from './useAuth';

export function useStorageStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, ['storage-status']),
    queryFn: functions.storageStatus,
    enabled: !!user,
    staleTime: (query) => storageStatusPollInterval(query.state.data),
    refetchInterval: (query) => storageStatusPollInterval(query.state.data),
    refetchOnWindowFocus: false,
  });
}
