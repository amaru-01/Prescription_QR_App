"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { prescriptionApi } from "@/lib/api";
import type { DashboardStats } from "@/lib/stats";
import type { Prescription } from "@/types/prescription";

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Could not load prescriptions.";

/**
 * Client-side prescription list: first page on mount, `loadMore()` for older
 * pages, account-wide totals, and refresh on cross-view `veridose:data-changed`.
 */
export function usePrescriptions(pageSize = 50) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Ignores responses from superseded requests (e.g. refresh during load). */
  const generation = useRef(0);

  /**
   * Fetch the first page and totals. State is only set in promise callbacks,
   * so this is safe to start from an effect; stale responses are dropped.
   */
  const loadFirstPage = useCallback((): Promise<void> => {
    const current = ++generation.current;
    const isCurrent = () => current === generation.current;
    return Promise.all([
      prescriptionApi.listPage({ limit: pageSize }),
      prescriptionApi.stats().catch(() => null),
    ])
      .then(([page, totals]) => {
        if (!isCurrent()) return;
        setPrescriptions(page.prescriptions);
        setNextCursor(page.nextCursor);
        setStats(totals);
        setError(null);
      })
      .catch((cause) => {
        if (isCurrent()) setError(messageOf(cause));
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
  }, [pageSize]);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      await loadFirstPage();
    },
    [loadFirstPage],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const current = generation.current;
    setLoadingMore(true);
    try {
      const page = await prescriptionApi.listPage({ limit: pageSize, cursor: nextCursor });
      if (current !== generation.current) return;
      setPrescriptions((existing) => [...existing, ...page.prescriptions]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (current === generation.current) setError(messageOf(cause));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor, pageSize]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    const onChange = () => void loadFirstPage();
    window.addEventListener("veridose:data-changed", onChange);
    return () => window.removeEventListener("veridose:data-changed", onChange);
  }, [loadFirstPage]);

  return {
    prescriptions,
    stats,
    loading,
    loadingMore,
    hasMore: nextCursor !== null,
    error,
    refresh,
    loadMore,
    setPrescriptions,
  };
}
