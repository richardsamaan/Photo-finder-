import { useCallback, useEffect, useRef, useState } from "react";
import { api, type JobDetailResponse } from "../api/client";

/** Polls job status while it's actively running/searching; slows down when idle. */
export function useJobPolling(jobId: string | undefined) {
  const [data, setData] = useState<JobDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await api.getJob(jobId);
      setData(res);
      setError(null);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job.");
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const loop = async () => {
      const res = await refresh();
      if (cancelled) return;
      const active = res?.job.status === "running" || res?.runnerState === "running";
      timer.current = setTimeout(loop, active ? 1500 : 5000);
    };
    loop();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, refresh]);

  return { data, error, refresh };
}
