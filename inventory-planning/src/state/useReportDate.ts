import { useMemo } from "react";
import { useAppStore } from "./appStore";
import { latestTransactionDate } from "../lib/reportDate";

export interface ReportDateInfo {
  reportDate: Date;
  /** True if no SA79 transaction date could be found and we fell back to the system clock. */
  isFallback: boolean;
}

/** The Category Study / Risk Flagging "today" — the latest Transaction Date in the uploaded SA79 file. */
export function useReportDate(): ReportDateInfo {
  const sa79Rows = useAppStore((s) => s.sa79Rows);
  return useMemo(() => {
    const latest = latestTransactionDate(sa79Rows);
    return latest ? { reportDate: latest, isFallback: false } : { reportDate: new Date(), isFallback: true };
  }, [sa79Rows]);
}
