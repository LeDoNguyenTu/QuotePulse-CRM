import { useQuery } from '@tanstack/react-query';
import { accountQueryKey } from '../lib/accountQueryScope';
import { functions } from '../lib/functions';
import { useAuth } from './useAuth';

export function useStorageStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: accountQueryKey(user?.id, ['storage-status']),
    queryFn: functions.storageStatus,
    enabled: !!user,
    staleTime: 5 * 60 * 1_000,
    refetchOnWindowFocus: false,
  });
}
