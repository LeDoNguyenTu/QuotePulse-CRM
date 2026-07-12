import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { functions, type QueueProgress } from '../lib/functions';
import type { CompanyDashboardRow } from '../lib/types';

const MIN_COOLDOWN = 2; // Exchange Online hard floor (30 msgs/min).

export interface QueueEmailInput {
  companies: CompanyDashboardRow[];
  templateId: string;
  subject: string;
  body: string;
  cooldownSeconds: number;
}

/**
 * Queues one email_sends row per selected company (using its primary contact
 * email) then repeatedly invokes process-email-queue until the queue drains,
 * because a single Edge Function invocation only sends a bounded batch within
 * its wall-time budget.
 */
export function useEmailQueue() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enqueue = useCallback(async (input: QueueEmailInput) => {
    setError(null);
    const cooldown = Math.max(MIN_COOLDOWN, Math.floor(input.cooldownSeconds));

    const rows = input.companies
      .filter((c) => c.primary_contact_email)
      .map((c) => ({
        company_id: c.id,
        template_id: input.templateId,
        to_email: c.primary_contact_email as string,
        subject: input.subject,
        // body_rendered is finalized server-side per recipient, but store the
        // template body as a fallback.
        body_rendered: input.body,
        status: 'queued' as const,
        cooldown_seconds: cooldown,
      }));

    if (rows.length === 0) {
      throw new Error('None of the selected companies have a primary contact email.');
    }

    // created_by is filled by the column default auth.uid() (0005_tenancy.sql).
    // It used to stay NULL until send time, which is what let one user's queue
    // be drained by another user's mailbox.
    const { error: insErr } = await supabase.from('email_sends').insert(rows);
    if (insErr) throw insErr;
    return rows.length;
  }, []);

  // Drive the worker to completion, updating progress each batch.
  const drain = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      // Safety cap on iterations to avoid an infinite loop if the server keeps
      // reporting work but never finishes.
      for (let i = 0; i < 500; i++) {
        const p = await functions.processEmailQueue();
        setProgress(p);
        if (p.done || p.remaining === 0) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  return { enqueue, drain, running, progress, error, MIN_COOLDOWN };
}

// RLS (created_by = auth.uid()) scopes this to the caller, so it now agrees with
// the server-side daily-cap count. Before 0005 it counted every user's sends.
export async function countSentLast24h(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('email_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', since);
  if (error) throw error;
  return count ?? 0;
}
