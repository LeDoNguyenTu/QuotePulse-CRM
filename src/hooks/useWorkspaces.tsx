import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { accountQueryKey } from '../lib/accountQueryScope';
import { supabase } from '../lib/supabase';
import {
  normalizeWorkspaceMemberships,
  type Workspace,
} from '../lib/workspaces';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
const ActiveWorkspaceContext = createContext<Workspace | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const query = useQuery<Workspace[]>({
    queryKey: accountQueryKey(user?.id, ['workspaces']),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workspace_members')
        .select('role, workspaces!inner(id,name,kind)')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return normalizeWorkspaceMemberships(data);
    },
  });

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  }), [query.data, query.error, query.isLoading, query.refetch]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspaces must be used within a WorkspaceProvider');
  return value;
}

export function ActiveWorkspaceProvider({
  workspace,
  children,
}: {
  workspace: Workspace;
  children: ReactNode;
}) {
  return (
    <ActiveWorkspaceContext.Provider value={workspace}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}

export function useActiveWorkspace(): Workspace {
  const value = useContext(ActiveWorkspaceContext);
  if (!value) {
    throw new Error('useActiveWorkspace must be used within an ActiveWorkspaceProvider');
  }
  return value;
}
