"use client";

import { useCallback, useEffect, useState } from "react";

import { prescriptionApi } from "@/lib/api";
import type { Prescription } from "@/types/prescription";

/** Client-side prescription list with refresh + cross-view invalidation. */
export function usePrescriptions(limit = 100) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const records = await prescriptionApi.list(limit);
        setPrescriptions(records);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load prescriptions.");
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => void refresh({ silent: true });
    window.addEventListener("veridose:data-changed", onChange);
    return () => window.removeEventListener("veridose:data-changed", onChange);
  }, [refresh]);

  return {
    prescriptions,
    loading,
    error,
    refresh,
    setPrescriptions,
  };
}
