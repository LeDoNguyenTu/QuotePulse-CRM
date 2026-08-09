import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import type { ImportProgress, IngestResult } from '../lib/functions';
import { functions } from '../lib/functions';
import { accumulateImportResult, emptyImportResult } from '../lib/importSession';
import { useAuth } from './useAuth';

const STALE_RUN_MS = 2 * 60 * 1000;

export interface LiveImport {
  counts: IngestResult['counts'];
  progress: ImportProgress | null;
  startedAt: number;
  step: number;
}

type ImportStatus = 'idle' | 'running' | 'paused' | 'complete' | 'failed';

interface StoredImportState {
  version: 1;
  ownerId: string;
  tabId: string;
  status: ImportStatus;
  report: IngestResult | null;
  live: LiveImport | null;
  stopRequested: boolean;
  updatedAt: number;
}

interface HubspotImportContextValue {
  state: StoredImportState | null;
  startImport: () => Promise<void>;
  stopImport: () => void;
  dismissImportReport: () => void;
}

const HubspotImportContext = createContext<HubspotImportContextValue | null>(null);

function storageKey(ownerId: string) {
  return `quotepulse:hubspot-import:${ownerId}`;
}

function readStoredState(ownerId: string): StoredImportState | null {
  try {
    const raw = localStorage.getItem(storageKey(ownerId));
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredImportState;
    return value.version === 1 && value.ownerId === ownerId ? value : null;
  } catch {
    return null;
  }
}

function createTabId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function HubspotImportProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const tabId = useRef(createTabId());
  const [state, setState] = useState<StoredImportState | null>(null);

  const writeState = useCallback((next: StoredImportState) => {
    setState(next);
    try {
      localStorage.setItem(storageKey(next.ownerId), JSON.stringify(next));
    } catch {
      // Import progress still works in this tab when private browsing blocks storage.
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setState(null);
      return;
    }
    const saved = readStoredState(user.id);
    if (saved?.status === 'running' && Date.now() - saved.updatedAt > STALE_RUN_MS) {
      const paused = {
        ...saved,
        status: 'paused' as const,
        stopRequested: false,
        updatedAt: Date.now(),
        report: {
          ...(saved.report ?? emptyImportResult()),
          warnings: [...(saved.report?.warnings ?? []), 'Import paused because its browser tab closed or reloaded. Select Run HubSpot import to resume.'],
        },
      };
      writeState(paused);
      return;
    }
    setState(saved);
  }, [user?.id, writeState]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!user || event.key !== storageKey(user.id)) return;
      setState(readStoredState(user.id));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  const startImport = useCallback(async () => {
    if (!user) return;
    const existing = readStoredState(user.id);
    if (
      existing?.status === 'running' &&
      existing.tabId !== tabId.current &&
      Date.now() - existing.updatedAt <= STALE_RUN_MS
    ) {
      setState(existing);
      return;
    }

    let report = existing?.status === 'paused' && existing.report
      ? { ...existing.report, warnings: existing.report.warnings.filter((warning) => !warning.startsWith('Import paused')) }
      : emptyImportResult();
    const startedAt = existing?.live?.startedAt ?? Date.now();
    let live: LiveImport = {
      counts: { ...report.counts },
      progress: report.progress ?? null,
      startedAt,
      step: existing?.live?.step ?? 0,
    };
    writeState({
      version: 1,
      ownerId: user.id,
      tabId: tabId.current,
      status: 'running',
      report,
      live,
      stopRequested: false,
      updatedAt: Date.now(),
    });

    try {
      for (let step = live.step + 1; ; step++) {
        const saved = readStoredState(user.id);
        if (saved?.stopRequested) {
          report = {
            ...report,
            done: false,
            warnings: [...new Set([...report.warnings, 'Stopped early. Everything imported so far is saved — run the import again to resume.'])],
          };
          writeState({ version: 1, ownerId: user.id, tabId: tabId.current, status: 'paused', report, live, stopRequested: false, updatedAt: Date.now() });
          return;
        }

        const result = await functions.hubspotIngest();
        report = accumulateImportResult(report, result);
        live = { counts: { ...report.counts }, progress: result.progress ?? live.progress, startedAt, step };
        queryClient.invalidateQueries({ queryKey: ['account'] });
        if (result.done ?? true) {
          writeState({ version: 1, ownerId: user.id, tabId: tabId.current, status: result.ok ? 'complete' : 'failed', report, live: null, stopRequested: false, updatedAt: Date.now() });
          return;
        }
        writeState({ version: 1, ownerId: user.id, tabId: tabId.current, status: 'running', report, live, stopRequested: false, updatedAt: Date.now() });
      }
    } catch (error) {
      report = { ...report, ok: false, errors: [...report.errors, error instanceof Error ? error.message : String(error)] };
      writeState({ version: 1, ownerId: user.id, tabId: tabId.current, status: 'failed', report, live: null, stopRequested: false, updatedAt: Date.now() });
    } finally {
      queryClient.invalidateQueries({ queryKey: ['account'] });
    }
  }, [queryClient, user, writeState]);

  const stopImport = useCallback(() => {
    if (!user) return;
    const current = readStoredState(user.id) ?? state;
    if (!current || current.status !== 'running') return;
    writeState({ ...current, stopRequested: true, updatedAt: Date.now() });
  }, [state, user, writeState]);

  const dismissImportReport = useCallback(() => {
    if (!user) return;
    const idle: StoredImportState = {
      version: 1,
      ownerId: user.id,
      tabId: tabId.current,
      status: 'idle',
      report: null,
      live: null,
      stopRequested: false,
      updatedAt: Date.now(),
    };
    writeState(idle);
  }, [user, writeState]);

  const value = useMemo(
    () => ({ state, startImport, stopImport, dismissImportReport }),
    [dismissImportReport, startImport, state, stopImport]
  );
  return <HubspotImportContext.Provider value={value}>{children}</HubspotImportContext.Provider>;
}

export function useHubspotImport() {
  const value = useContext(HubspotImportContext);
  if (!value) throw new Error('useHubspotImport must be used inside HubspotImportProvider');
  return value;
}

export function HubspotImportToast() {
  const { state, dismissImportReport } = useHubspotImport();
  const location = useLocation();
  if (state?.status !== 'complete' || location.pathname === '/' || !state.report) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] rounded-lg border border-emerald-200 bg-white p-4 shadow-xl">
      <p className="font-medium text-emerald-800">HubSpot sync complete</p>
      <p className="mt-1 text-sm text-slate-600">{state.report.counts.deals.toLocaleString()} deals and {state.report.counts.companies.toLocaleString()} companies updated.</p>
      <button className="mt-3 text-sm text-brand-700 underline" onClick={dismissImportReport}>Acknowledge</button>
    </div>
  );
}
